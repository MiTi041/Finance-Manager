import { normalizeIban } from "@/lib/iban";
import type { BankAccountOption } from "@/lib/utils/accounts";
import type { Transaction } from "@/types/transaction";

export type AccountFlowNode = {
  id: string;
  label: string;
  bankName: string;
  iban: string;
  bankLogo?: string;
  balance?: number;
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

type AccountBalance = {
  accountIban: string;
  balance: number;
};

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
  const resolveAccountIban = (iban: string) => migratedIbanToCurrentIban.get(iban) ?? iban;

  const nodes = accounts
    .map((account) => {
      const iban = normalizeIban(account.accountIban);
      return {
        id: iban,
        label: account.accountName,
        bankName: account.bankName,
        iban,
        bankLogo: account.bankLogo,
        balance: balanceByIban.get(iban),
      };
    })
    .filter((node) => Boolean(node.id));

  const edgesByPair = new Map<string, AccountFlowEdge>();

  for (const transaction of transactions) {
    const sourceAccount = resolveAccountIban(normalizeIban(transaction.konto.iban));
    const counterparty = resolveAccountIban(normalizeIban(transaction.zahlungspartner.iban));
    if (!accountByIban.has(sourceAccount) || !accountByIban.has(counterparty)) continue;
    if (!sourceAccount || !counterparty || sourceAccount === counterparty) continue;

    const transferAmount = Math.abs(transaction.betrag.wert);
    if (!Number.isFinite(transferAmount) || transferAmount <= 0) continue;

    const outgoing = transaction.betrag.wert < 0;
    const source = outgoing ? sourceAccount : counterparty;
    const target = outgoing ? counterparty : sourceAccount;
    const [firstAccount, secondAccount] = [source, target].sort();
    const id = `${firstAccount}|${secondAccount}`;
    const existing = edgesByPair.get(id);

    if (existing) {
      if (source === firstAccount) {
        existing.amountSourceToTarget += transferAmount;
      } else {
        existing.amountTargetToSource += transferAmount;
      }
      existing.transactionCount += 1;
      existing.transactions.push(transaction);
    } else {
      edgesByPair.set(id, {
        id,
        source: firstAccount,
        target: secondAccount,
        amountSourceToTarget: source === firstAccount ? transferAmount : 0,
        amountTargetToSource: source === secondAccount ? transferAmount : 0,
        transactionCount: 1,
        transactions: [transaction],
      });
    }
  }

  return {
    nodes,
    edges: [...edgesByPair.values()]
      .filter((edge) => edge.amountSourceToTarget > 0 || edge.amountTargetToSource > 0)
      .sort(
        (a, b) =>
          b.amountSourceToTarget +
          b.amountTargetToSource -
          (a.amountSourceToTarget + a.amountTargetToSource),
      ),
  };
}
