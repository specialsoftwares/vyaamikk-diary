import assert from "node:assert/strict";

import {
  filterFactsByFreeMembership,
  filterGrinByFreeMembership,
} from "./freeMembershipInsightFilter";

{
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(
    filterFactsByFreeMembership(rows, { kind: "paid" }).map((r) => r.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    filterFactsByFreeMembership(rows, {
      kind: "free",
      freeMembershipIds: ["a", "c"],
    }).map((r) => r.id),
    ["a", "c"]
  );
  // Delete of b stops contribution without needing the id removed from membership.
  assert.deepEqual(
    filterFactsByFreeMembership([{ id: "a" }, { id: "c" }], {
      kind: "free",
      freeMembershipIds: ["a", "b", "c"],
    }).map((r) => r.id),
    ["a", "c"]
  );
  assert.deepEqual(filterFactsByFreeMembership(rows, { kind: "unknown" }), []);
}

{
  const grin = [{ receiptId: "g1" }, { receiptId: "g2" }];
  assert.deepEqual(
    filterGrinByFreeMembership(grin, {
      kind: "free",
      freeMembershipIds: ["g2"],
    }).map((r) => r.receiptId),
    ["g2"]
  );
}

console.log("freeMembershipInsightFilter.test.ts: ok");
