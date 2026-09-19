import { normalizeIban } from "@/lib/iban";
import type { BankAccountOption } from "@/lib/utils/accounts";
import type { Transaction } from "@/types/transaction";

export type AccountFlowNode = {
  id: string;
  label: string;
  bankName: string;
  iban: string;
  bankLogo?: string;
  bankLogoDark?: string;
  logoPadding?: number;
  balance?: number;
  /**
   * Balance minus the account's net internal flow: money that flowed in
   * (positive) or out (negative) of the account without an internal
   * counterparty. Undefined without a balance or when it cancels out.
   */
  externalFlow?: number;
};

export type AccountFlowEdge = {
  id: string;
  source: string;
  target: string;
  amountSourceToTarget: number;
  amountTargetToSource: number;
  transactionCount: number;
  transactions: Transaction[];
};

export type AccountFlowGraph = {
  nodes: AccountFlowNode[];
  edges: AccountFlowEdge[];
};

/** Net flow from `source` to `target`; negative means the money flows the other way. */
export function netFlowAmount(
  edge: Pick<AccountFlowEdge, "amountSourceToTarget" | "amountTargetToSource">,
): number {
  return edge.amountSourceToTarget - edge.amountTargetToSource;
}

const FLOW_ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];

/** Arrow pointing the way the net flow moves on screen, from `from` to `to`. */
export function flowArrow(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return FLOW_ARROWS[Math.round(angle / (Math.PI / 4)) & 7];
}

/** Half a cent: below this the two directions cancel out for display purposes. */
const NET_FLOW_EPSILON = 0.005;

/** Both legs of one transfer are booked within a few days of each other. */
const TRANSFER_LEG_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

type AccountBalance = {
  accountIban: string;
  balance: number;
};

type TransferLeg = {
  transaction: Transaction;
  account: string;
  counterparty: string;
  amount: number;
  outgoing: boolean;
  timestamp: number;
  consumed: boolean;
};

function transferTimestamp(transaction: Transaction): number {
  const value = transaction.daten.buchungsdatum ?? transaction.daten.erstelltAm;
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function legPairKey(first: string, second: string): string {
  return [first, second].sort().join("|");
}

/**
 * A transfer between two of your accounts is booked twice: once as outgoing on
 * the source and once as incoming on the target. Both legs must only count once.
 * Matches every outgoing leg with the nearest incoming leg on the opposite
 * account (same amount, within {@link TRANSFER_LEG_WINDOW_MS}) and marks the
 * incoming one as consumed. Legs without a counterpart (e.g. a manual ledger
 * entry whose bank side is not synced) still count on their own.
 */
function markDuplicateTransferLegs(legs: TransferLeg[]): void {
  const incomingByKey = new Map<string, TransferLeg[]>();
  for (const leg of legs) {
    if (leg.outgoing) continue;
    const key = `${legPairKey(leg.account, leg.counterparty)}|${leg.amount.toFixed(2)}`;
    const bucket = incomingByKey.get(key);
    if (bucket) bucket.push(leg);
    else incomingByKey.set(key, [leg]);
  }

  for (const leg of legs) {
    if (!leg.outgoing) continue;
    const bucket = incomingByKey.get(
      `${legPairKey(leg.account, leg.counterparty)}|${leg.amount.toFixed(2)}`,
    );
    if (!bucket) continue;

    let match: TransferLeg | null = null;
    let matchDelta = Infinity;
    for (const candidate of bucket) {
      if (candidate.consumed || candidate.account !== leg.counterparty) continue;
      const delta = Math.abs(candidate.timestamp - leg.timestamp);
      if (delta <= TRANSFER_LEG_WINDOW_MS && delta < matchDelta) {
        match = candidate;
        matchDelta = delta;
      }
    }
    if (match) match.consumed = true;
  }
}

export function buildAccountFlowGraph(
  accounts: BankAccountOption[],
  transactions: Transaction[],
  balances: AccountBalance[] = [],
): AccountFlowGraph {
  const balanceByIban = new Map(
    balances.map((account) => [normalizeIban(account.accountIban), account.balance]),
  );
  const accountByIban = new Map(
    accounts
      .map((account) => [normalizeIban(account.accountIban), account] as const)
      .filter(([iban]) => Boolean(iban)),
  );
  const migratedIbanToCurrentIban = new Map<string, string>();
  for (const transaction of transactions) {
    const currentIban = normalizeIban(transaction.konto.iban);
    const originIban = normalizeIban(transaction.herkunft?.iban ?? "");
    if (currentIban && originIban && accountByIban.has(currentIban)) {
      migratedIbanToCurrentIban.set(originIban, currentIban);
    }
  }
  // A provider's fixed payout IBAN (e.g. Scalable's Verrechnungskonto) belongs
  // to the account, so flows from it are attributed to the account.
  const senderIbanToAccountIban = new Map<string, string>();
  for (const account of accounts) {
    const iban = normalizeIban(account.accountIban);
    const senderIban = normalizeIban(account.senderIban ?? "");
    if (iban && senderIban && senderIban !== iban) {
      senderIbanToAccountIban.set(senderIban, iban);
    }
  }
  const resolveAccountIban = (iban: string) => {
    const resolved = migratedIbanToCurrentIban.get(iban) ?? iban;
    return senderIbanToAccountIban.get(resolved) ?? resolved;
  };

  const nodes = accounts
    .map((account) => {
      const iban = normalizeIban(account.accountIban);
      return {
        id: iban,
        label: account.accountName,
        bankName: account.bankName,
        iban,
        bankLogo: account.bankLogo,
        bankLogoDark: account.bankLogoDark,
        logoPadding: account.logoPadding,
        balance: balanceByIban.get(iban),
      };
    })
    .filter((node) => Boolean(node.id));

  const transferLegs: TransferLeg[] = [];

  for (const transaction of transactions) {
    const account = resolveAccountIban(normalizeIban(transaction.konto.iban));
    const counterparty = resolveAccountIban(normalizeIban(transaction.zahlungspartner.iban));
    if (!accountByIban.has(account) || !accountByIban.has(counterparty)) continue;
    if (!account || !counterparty || account === counterparty) continue;

    const amount = Math.abs(transaction.betrag.wert);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    transferLegs.push({
      transaction,
      account,
      counterparty,
      amount,
      outgoing: transaction.betrag.wert < 0,
      timestamp: transferTimestamp(transaction),
      consumed: false,
    });
  }

  markDuplicateTransferLegs(transferLegs);

  const edgesByPair = new Map<string, AccountFlowEdge>();

  for (const leg of transferLegs) {
    if (!leg.outgoing && leg.consumed) continue;

    const source = leg.outgoing ? leg.account : leg.counterparty;
    const target = leg.outgoing ? leg.counterparty : leg.account;
    const [firstAccount, secondAccount] = [source, target].sort();
    const id = `${firstAccount}|${secondAccount}`;
    const existing = edgesByPair.get(id);

    if (existing) {
      if (source === firstAccount) {
        existing.amountSourceToTarget += leg.amount;
      } else {
        existing.amountTargetToSource += leg.amount;
      }
      existing.transactionCount += 1;
      existing.transactions.push(leg.transaction);
    } else {
      edgesByPair.set(id, {
        id,
        source: firstAccount,
        target: secondAccount,
        amountSourceToTarget: source === firstAccount ? leg.amount : 0,
        amountTargetToSource: source === secondAccount ? leg.amount : 0,
        transactionCount: 1,
        transactions: [leg.transaction],
      });
    }
  }

  const edges = [...edgesByPair.values()]
    .filter((edge) => Math.abs(netFlowAmount(edge)) >= NET_FLOW_EPSILON)
    .sort((a, b) => Math.abs(netFlowAmount(b)) - Math.abs(netFlowAmount(a)));

  const internalNetByAccount = new Map<string, number>();
  for (const edge of edges) {
    const net = netFlowAmount(edge);
    internalNetByAccount.set(edge.source, (internalNetByAccount.get(edge.source) ?? 0) - net);
    internalNetByAccount.set(edge.target, (internalNetByAccount.get(edge.target) ?? 0) + net);
  }

  return {
    nodes: nodes.map((node) => {
      if (node.balance === undefined) return node;
      const externalFlow = node.balance - (internalNetByAccount.get(node.id) ?? 0);
      return Math.abs(externalFlow) < NET_FLOW_EPSILON ? node : { ...node, externalFlow };
    }),
    edges,
  };
}
