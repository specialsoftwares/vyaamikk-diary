import assert from "node:assert/strict";

import { generateAllStatutoryDues } from "./statutoryDeadlineEngine";

const visible = new Date(2028, 0, 15, 12).getTime();
const dues = generateAllStatutoryDues(new Date(2026, 9, 17, 12), {
  minMs: new Date(2027, 11, 1, 0).getTime(),
  maxMs: new Date(2028, 1, 29, 23).getTime(),
});
assert.ok(dues.some((due) => due.dueDateMs >= visible - 20 * 24 * 60 * 60 * 1000));
assert.equal(
  dues.every((due) => due.dueDateKey !== "NaN-NaN-NaN"),
  true
);
console.log("statutoryWindow.correction.test.ts: ok");
