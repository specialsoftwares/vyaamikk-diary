import assert from "node:assert/strict";

import { GRIN_DOCUMENT_FOOTER } from "./constants";
import {
  addQuantity,
  applyReturnDispatch,
  classifyShortageOrExcess,
  convertQuantity,
  emptyLedgers,
  IncompatibleUnitsError,
  quantity,
} from "./quantities";

assert.match(GRIN_DOCUMENT_FOOTER, /not a GST Receipt Voucher/);

const tenBags = quantity("10", "bags");
const twoBags = quantity("2", "bags");
assert.equal(addQuantity(tenBags, twoBags).value, "12");

assert.throws(
  () => addQuantity(tenBags, quantity("2", "kg")),
  (err: unknown) => err instanceof IncompatibleUnitsError
);

const kg = convertQuantity(twoBags, {
  fromUnit: "bags",
  toUnit: "kg",
  factor: "50",
  recordedMeasurementId: "weighment_1",
});
assert.equal(kg.unit, "kg");
assert.equal(kg.value, "100");

const expected = quantity("10", "bags");
assert.equal(
  classifyShortageOrExcess({
    expectedOnThisDelivery: expected,
    physicallyReceived: quantity("6", "bags"),
  }),
  "shortage"
);
assert.equal(
  classifyShortageOrExcess({
    expectedOnThisDelivery: expected,
    physicallyReceived: quantity("10", "bags"),
  }),
  "none"
);

const invoiceQty = quantity("100", "bags");
const thisDelivery = quantity("40", "bags");
const received = quantity("40", "bags");
assert.equal(
  classifyShortageOrExcess({
    expectedOnThisDelivery: thisDelivery,
    physicallyReceived: received,
  }),
  "none",
  "split deliveries compare against this delivery, not the invoice total"
);
assert.equal(invoiceQty.value, "100");

const ledgers = emptyLedgers("bags");
ledgers.physicalReceived = quantity("10", "bags");
const afterReturn = applyReturnDispatch(ledgers, quantity("3", "bags"));
assert.equal(afterReturn.physicalReceived.value, "10", "returns do not rewrite physical receipt");
assert.equal(afterReturn.dispatchedReturn.value, "3");

assert.throws(
  () => applyReturnDispatch(afterReturn, quantity("8", "bags")),
  /exceeds available custody/
);

console.log("goodsEvidence/quantities.test.ts: ok");
