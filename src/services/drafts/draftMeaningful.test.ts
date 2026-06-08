import assert from "node:assert/strict";

import { isDraftPayloadMeaningful } from "./draftMeaningful";

const emptyMaterial = {
  title: "",
  entryDate: Date.now(),
  notes: null,
  partyName: "",
  materialName: "",
  quantity: "",
  unit: "",
  qualityStatus: "ok",
  issueNote: "",
};

assert.equal(isDraftPayloadMeaningful(emptyMaterial), false, "material defaults only");

const emptyFreight = {
  entryDate: Date.now(),
  weightUnit: "Kg",
  freightType: "to_pay",
  ccCopyInstruction: "not_attached",
  totalBoxes: "",
};

assert.equal(isDraftPayloadMeaningful(emptyFreight), false, "freight defaults only");

const cashStarted = {
  entryDate: Date.now(),
  paymentDate: Date.now(),
  amount: "500",
  givenToName: "",
};

assert.equal(isDraftPayloadMeaningful(cashStarted), true, "amount entered");

console.log("draftMeaningful.test.ts: ok");
