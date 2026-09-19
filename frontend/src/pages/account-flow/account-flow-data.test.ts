import { strict as assert } from "node:assert";

import { buildAccountFlowGraph, flowArrow, netFlowAmount } from "./account-flow-data.ts";

assert.equal(flowArrow({ x: 0, y: 0 }, { x: 10, y: 0 }), "→");
assert.equal(flowArrow({ x: 0, y: 0 }, { x: -10, y: 0 }), "←");
assert.equal(flowArrow({ x: 0, y: 0 }, { x: 0, y: 10 }), "↓");
assert.equal(flowArrow({ x: 0, y: 0 }, { x: 0, y: -10 }), "↑");
assert.equal(flowArrow({ x: 0, y: 0 }, { x: 10, y: 10 }), "↘");
assert.equal(flowArrow({ x: 0, y: 0 }, { x: -10, y: -10 }), "↖");

const NORIS = "DE18760260000037114600";
const CHASE = "DE28501108080012359192";

function account(iban: string, name: string) {
  return { accountIban: iban, accountName: name, bankName: name, scope: name };
}

function tx(
  id: number,
  accountIban: string,
  counterpartyIban: string,
  amount: number,
  date: string,
  originIban: string | null = null,
) {
  return {
    id,
    konto: { iban: accountIban, bic: "", kontonummer: "", unterkonto: "", blz: "" },
    herkunft: originIban ? { iban: originIban, bankName: null, migratedAt: null } : null,
    zahlungspartner: { iban: counterpartyIban },
    betrag: { wert: amount, originalWert: amount, waehrung: "EUR", refundTotal: 0 },
    daten: {
      buchungsdatum: new Date(date),
      wertstellungsdatum: null,
      geschaetztesBuchungsdatum: null,
      erstelltAm: new Date(date),
    },
  } as unknown as Parameters<typeof buildAccountFlowGraph>[1][number];
}

const accounts = [account(NORIS, "Norisbank"), account(CHASE, "Chase Tagesgeld")];

// Chase case: every transfer is booked on both sides, plus one orphan manual
// entry whose bank leg is not synced.
const chaseGraph = buildAccountFlowGraph(accounts, [
  tx(1, NORIS, CHASE, -100, "2026-08-06"), // deposit leg 1
  tx(2, CHASE, NORIS, 100, "2026-08-07"), // deposit leg 2 (duplicate)
  tx(3, CHASE, NORIS, 50, "2026-08-20"), // orphan incoming, no bank leg
  tx(4, CHASE, NORIS, -30, "2026-09-01"), // withdrawal leg 1
  tx(5, NORIS, CHASE, 30, "2026-09-01"), // withdrawal leg 2 (duplicate)
]);

const chaseEdge = chaseGraph.edges.find(
  (edge) => edge.source === NORIS && edge.target === CHASE,
);
assert.ok(chaseEdge, "expected a Norisbank<->Chase edge");
assert.equal(chaseEdge.transactionCount, 3, "each transfer counted once");
assert.equal(chaseEdge.amountSourceToTarget, 150, "deposits: 100 + orphan 50");
assert.equal(chaseEdge.amountTargetToSource, 30, "withdrawal counted once");
assert.equal(netFlowAmount(chaseEdge), 120);

// A provider's payout IBAN (sender_iban) belongs to the account: the bank leg
// of a Scalable payout resolves to the Scalable account and dedupes with the
// manual ledger leg.
const SCALABLE = "DE90120700700752637659";
const SCALABLE_PAYOUT = "DE86700700100922050000";

const aliasGraph = buildAccountFlowGraph(
  [
    account(NORIS, "Norisbank"),
    { ...account(SCALABLE, "Scalable Capital"), senderIban: SCALABLE_PAYOUT },
  ],
  [
    tx(10, SCALABLE, NORIS, -50, "2026-05-02"), // payout leg in the manual ledger
    tx(11, NORIS, SCALABLE_PAYOUT, 50, "2026-05-03"), // matching bank leg
    tx(12, NORIS, SCALABLE_PAYOUT, 30, "2026-06-02"), // orphan bank leg
  ],
);
const aliasEdge = aliasGraph.edges.find(
  (edge) => edge.source === NORIS && edge.target === SCALABLE,
);
assert.ok(aliasEdge, "expected a Norisbank<->Scalable edge");
assert.equal(aliasEdge.transactionCount, 2, "payout counted once, orphan counted");
assert.equal(netFlowAmount(aliasEdge), -80, "50 payout + 30 orphan, no double count");

// Legs further apart than the matching window are treated as separate bookings.
const outsideWindow = buildAccountFlowGraph(accounts, [
  tx(6, NORIS, CHASE, -10, "2026-08-01"),
  tx(7, CHASE, NORIS, 10, "2026-08-20"),
]);
const outsideEdge = outsideWindow.edges.find(
  (edge) => edge.source === NORIS && edge.target === CHASE,
);
assert.ok(outsideEdge);
assert.equal(netFlowAmount(outsideEdge), 20, "legs outside the window both count");
assert.equal(outsideEdge.transactionCount, 2);

// External flow: balance minus the account's net internal flow. A transfer of
// 2009.96 into Chase leaves a balance of 74.88, so 1935.08 must have left the
// account without an internal counterparty.
const externalGraph = buildAccountFlowGraph(
  accounts,
  [
    tx(20, NORIS, CHASE, -2009.96, "2026-08-06"),
    tx(21, CHASE, NORIS, 2009.96, "2026-08-07"),
  ],
  [{ accountIban: CHASE, balance: 74.88 }],
);
const chaseNode = externalGraph.nodes.find((node) => node.id === CHASE);
assert.equal(chaseNode?.balance, 74.88);
assert.equal(chaseNode?.externalFlow, -1935.08);
const norisNode = externalGraph.nodes.find((node) => node.id === NORIS);
assert.equal(norisNode?.externalFlow, undefined, "no balance means no external flow");

// A balance that exactly matches the internal flow cancels out and is hidden.
const balancedGraph = buildAccountFlowGraph(
  accounts,
  [tx(22, NORIS, CHASE, -100, "2026-08-06")],
  [{ accountIban: CHASE, balance: 100 }],
);
assert.equal(
  balancedGraph.nodes.find((node) => node.id === CHASE)?.externalFlow,
  undefined,
);

console.log("account-flow-data.test.ts ok");
