import assert from "node:assert/strict";
import { assertBusinessSealBinding, sealedBusinessCloud } from "./businessCloudSeal";
import { sealContent, openContent } from "../../../functions/src/privacy/contentEncryption";

const key = Buffer.alloc(32, 4);
const seal = sealContent({ key, uid: "owner-a", collection: "customerCreditRecords",
  recordId: "credit-1", revision: 10, purpose: "customer_credit",
  plaintext: Buffer.from(JSON.stringify({ customerName: "Private customer", payments: [] })) });
const record = { id: "credit-1", userId: "owner-a", updatedAt: 10 };
assertBusinessSealBinding("customerCreditRecords", record, seal);
for (const wrong of [{ ...record, id: "restore" }, { ...record, userId: "owner-b" }, { ...record, updatedAt: 11 }]) {
  assert.throws(() => assertBusinessSealBinding("customerCreditRecords", wrong, seal), /seal_binding_mismatch/);
}
const cloud = sealedBusinessCloud({ collection: "customerCreditRecords", plain: {
  ...record, customerName: "Private customer", payments: [],
  closure: { payerName: "Private payer", payerMobile: "private mobile", closingRemarks: "private note" },
  charges: { customLabel: "private label" },
}, seal });
assert.equal(cloud.customerName, null);
assert.equal(cloud.payments, null);
assert.equal(cloud.closure, null);
assert.equal(cloud.charges, null);
const packCloud = sealedBusinessCloud({ collection: "professionalPacks", plain: {
  attachments: [{ name: "private attachment" }], reminder: { note: "private reminder" },
}, seal });
assert.equal(packCloud.attachments, null);
assert.equal(packCloud.reminder, null);
assert.equal(JSON.parse(openContent({ key, ...seal, seal }).toString()).customerName, "Private customer");

// Server-owned age/session fields advance updatedAt independently of the profile seal.
const profileSeal = sealContent({ key, uid: "owner-a", collection: "users", recordId: "owner-a",
  revision: 10, purpose: "profile", plaintext: Buffer.from('{"displayName":"Private owner"}') });
assertBusinessSealBinding("users", { uid: "owner-a", updatedAt: 20 }, profileSeal);
assert.throws(() => assertBusinessSealBinding("users", { uid: "owner-b", updatedAt: 20 }, profileSeal), /seal_binding_mismatch/);
console.log("businessCloudSeal: owner, record, revision and profile metadata compatibility passed");
