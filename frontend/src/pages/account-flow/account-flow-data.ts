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
  amount: number;
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
    if (!transaction.technisch.isKontotransfer) continue;

    const sourceAccount = normalizeIban(transaction.konto.iban);
    const counterparty = normalizeIban(transaction.zahlungspartner.iban);
    if (!accountByIban.has(sourceAccount) || !accountByIban.has(counterparty)) continue;
    if (!sourceAccount || !counterparty || sourceAccount === counterparty) continue;

    const outgoing = transaction.betrag.wert < 0;
    const source = outgoing ? sourceAccount : counterparty;
    const target = outgoing ? counterparty : sourceAccount;
    const id = `${source}->${target}`;
    const existing = edgesByPair.get(id);

    if (existing) {
      existing.amount += Math.abs(transaction.betrag.wert);
      existing.transactionCount += 1;
      existing.transactions.push(transaction);
    } else {
      edgesByPair.set(id, {
        id,
        source,
        target,
        amount: Math.abs(transaction.betrag.wert),
        transactionCount: 1,
        transactions: [transaction],
      });
    }
  }

  return {
    nodes,
    edges: [...edgesByPair.values()].sort((a, b) => b.amount - a.amount),
  };
}