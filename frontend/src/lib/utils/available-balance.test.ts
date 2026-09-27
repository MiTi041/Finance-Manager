import { strict as assert } from "node:assert";

import { availableBalance } from "./available-balance.ts";

// Norisbank: Saldo-Korrektur + Buchungssumme ergeben 11,11 gebucht, vorgemerkt
// -11,11. Die Float-Addition lässt 2.4e-13 übrig, angezeigt wird 0,00 € – also
// darf die Karte keine aktive Überweisung anbieten.
const norisbankGiro = { balance: -43.809999999999761 + 54.92, balancePending: -11.11 };
assert.equal(availableBalance(norisbankGiro), 0);
assert.equal(availableBalance(norisbankGiro) > 0, false, "0,00 € verfügbar = nicht überweisbar");

assert.equal(availableBalance({ balance: 100, balancePending: -20 }), 80);
assert.equal(availableBalance({ balance: 11.11 }), 11.11);
assert.equal(availableBalance({ balance: 0.004 }), 0);
assert.equal(availableBalance({ balance: -0.001 }), 0);
