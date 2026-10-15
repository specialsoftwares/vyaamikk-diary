import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARTY_LEDGER_SERVER_PROJECTION_ENABLED } from "@/services/partyLedger/contracts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const savedRecords = fs.readFileSync(path.join(root, "app/(app)/(tabs)/saved-records.tsx"), "utf8");
assert.match(savedRecords, /partyLedger\.switchLedger/);
assert.match(savedRecords, /partyLedger\.switchRecords/);
assert.match(savedRecords, /PartyLedgerList/);
assert.equal(savedRecords.includes("Synced balance"), false);

const tabs = fs.readFileSync(path.join(root, "app/(app)/(tabs)/_layout.tsx"), "utf8");
assert.equal(tabs.includes("party-ledger"), false);
assert.match(tabs, /name="saved-records"/);

assert.equal(PARTY_LEDGER_SERVER_PROJECTION_ENABLED, false);
const contracts = fs.readFileSync(path.join(root, "src/services/partyLedger/contracts.ts"), "utf8");
assert.match(contracts, /export const PARTY_LEDGER_SERVER_PROJECTION_ENABLED = false/);

const surfaces = [
  "src/components/partyLedger/PartyLedgerList.tsx",
  "src/components/partyLedger/PartyLedgerDetail.tsx",
  "app/(app)/party-ledger/[partyId].tsx",
];
for (const rel of surfaces) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  assert.equal(text.includes("Synced balance"), false, rel);
}

console.log("partyLedgerEntry.contract.test.ts: ok");
