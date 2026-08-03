import { strict as assert } from "node:assert";
import {
  isValidIban,
  buildTransferRequestBody,
} from "./transfer-utils.ts";

assert.equal(isValidIban("DE89 3704 0044 0532 0130 00"), true);
assert.equal(isValidIban("DE89370400440532013000"), true);
assert.equal(isValidIban("DE89 3704 0044 0532 0130 01"), false);
assert.equal(isValidIban("DE00 3704 0044 0532 0130 00"), false);
assert.equal(isValidIban("NOPE"), false);
assert.equal(isValidIban(""), false);

const body = buildTransferRequestBody({
  senderIban: "DE89370400440532013000",
  recipientName: "Max Mustermann",
  recipientIban: "DE02120300000000202051",
  recipientBic: "BYLADEM1001",
  amount: 42.5,
  reason: "Test Überweisung",
});

assert.deepEqual(body, {
  recipient_iban: "DE02120300000000202051",
  recipient_name: "Max Mustermann",
  amount: 42.5,
  reason: "Test Überweisung",
  recipient_bic: "BYLADEM1001",
  sender_iban: "DE89370400440532013000",
  sender_name: "Finance-Manager",
});

const bodyNoBic = buildTransferRequestBody({
  senderIban: "DE89370400440532013000",
  recipientName: "Max",
  recipientIban: "DE02120300000000202051",
  amount: 10,
  reason: "x",
});
assert.equal("recipient_bic" in bodyNoBic, false);
