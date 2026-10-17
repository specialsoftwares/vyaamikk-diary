/**
 * Team 5 SOURCE regression: owner policy (approved for source, not live)
 * says one GRIN issuance consumes one monthly record allowance; other GRIN
 * commands do not.
 *
 * Consumption belongs in the Admin register transaction. Do not "fix" by
 * adding GRIN to client Rules quotaLinkedCollection (client create is false)
 * or by charging mutate / read / evidence.
 *
 * After Team 2 fold this suite is a positive lock: register must consume;
 * mutate / G2 must not. Label: SOURCE. Not application CI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(rel) {
  return readFileSync(join(repoRoot, rel), "utf8");
}

test("G1 register transaction consumes monthly record allowance", () => {
  const adapter = read("functions/src/goodsEvidence/g1/adapter.ts");
  const start = adapter.indexOf("async register(");
  const end = adapter.indexOf("async reconcile(");
  assert.ok(start >= 0 && end > start, "register and reconcile methods must exist");
  const registerSlice = adapter.slice(start, end);
  const consumes =
    registerSlice.includes("recordsThisMonth") ||
    registerSlice.includes("usageCurrent") ||
    registerSlice.includes("quota_exhausted");
  assert.equal(
    consumes,
    true,
    "register writes serial/receipt/event/command only; it does not consume monthly record allowance"
  );
});

test("other GRIN commands still must not consume monthly allowance", () => {
  const adapter = read("functions/src/goodsEvidence/g1/adapter.ts");
  const afterRegister = adapter.slice(adapter.indexOf("async reconcile("));
  assert.equal(afterRegister.includes("recordsThisMonth"), false);
  const g2 = read("functions/src/goodsEvidence/g2/adapter.ts");
  assert.equal(g2.includes("recordsThisMonth"), false);
});

test("client Rules quotaLinkedCollection stays diary-only (GRIN writes are Admin)", () => {
  const rules = read("firestore.rules");
  const start = rules.indexOf("function quotaLinkedCollection");
  assert.ok(start >= 0);
  const slice = rules.slice(start, start + 400);
  assert.equal(slice.includes("goodsEvidence"), false);
  assert.equal(slice.includes("grinEvidence"), false);
});
