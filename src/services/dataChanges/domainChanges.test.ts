import assert from "node:assert/strict";

import {
  currentDomainRevision,
  publishDomainChange,
  resetDomainChangesForTests,
  subscribeDomainChanges,
} from "./domainChanges";

resetDomainChangesForTests();
const seen: string[] = [];
const stop = subscribeDomainChanges((change) => {
  seen.push(`${change.ownerUid}:${change.source}:${change.revision}`);
});
const first = publishDomainChange("owner-a", "diary");
const second = publishDomainChange("owner-b", "statutory");
assert.equal(first.revision, 1);
assert.equal(second.revision, 2);
assert.deepEqual(seen, ["owner-a:diary:1", "owner-b:statutory:2"]);
stop();
publishDomainChange("owner-a", "diary");
assert.equal(seen.length, 2);
assert.equal(currentDomainRevision(), 3);
assert.throws(() => publishDomainChange("  ", "diary"));
resetDomainChangesForTests();
console.log("domainChanges.test.ts: ok");
