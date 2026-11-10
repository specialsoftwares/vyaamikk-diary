import assert from "node:assert/strict";

import { emailBindingKey } from "./emailBindingKey";
import { resolveVerifiedMailbox } from "./verifiedMailbox";

const UID = "uid-mailbox";
const ADDRESS = "owner@example.com";
const HASH = emailBindingKey(ADDRESS);

const user = {
  uid: UID,
  emailStatus: "verified",
  normalizedEmail: ADDRESS,
  emailHash: HASH,
  emailBindingVersion: 2,
};

const binding = {
  uid: UID,
  normalizedEmail: ADDRESS,
  status: "verified",
  bindingVersion: 2,
};

{
  const ok = resolveVerifiedMailbox(user, binding);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.normalizedEmail, ADDRESS);
}

assert.equal(resolveVerifiedMailbox({ ...user, emailStatus: "unverified" }, binding).outcome, "verification_required");

{
  const drifted = resolveVerifiedMailbox(
    { ...user, normalizedEmail: "attacker@example.com" },
    binding
  );
  assert.equal(drifted.ok, false);
  if (!drifted.ok) {
    assert.equal(drifted.outcome, "support");
    assert.equal(drifted.reason, "profile_mismatch");
  }
}

assert.equal(resolveVerifiedMailbox(user, null).reason, "binding_missing");
assert.equal(resolveVerifiedMailbox({ ...user, emailBindingVersion: undefined }, binding).reason, "binding_missing");
assert.equal(resolveVerifiedMailbox(user, { ...binding, uid: "other" }).reason, "uid_mismatch");
assert.equal(resolveVerifiedMailbox(user, { ...binding, status: "pending" }).reason, "status_mismatch");
assert.equal(resolveVerifiedMailbox(user, { ...binding, bindingVersion: 1 }).reason, "version_mismatch");
assert.equal(
  resolveVerifiedMailbox(user, { ...binding, normalizedEmail: "other@example.com" }).reason,
  "hash_mismatch"
);

{
  const legacy = resolveVerifiedMailbox(
    { ...user, normalizedEmail: "" },
    binding
  );
  assert.equal(legacy.ok, true, "a consistent binding is the destination when the profile address is empty");
  if (legacy.ok) assert.equal(legacy.normalizedEmail, ADDRESS);
}

console.log("verifiedMailbox.unit.test.ts: ok");
