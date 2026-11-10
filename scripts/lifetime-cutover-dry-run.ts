/**
 * Forward-only lifetime cutover — dry-run proposal only.
 *
 * Usage:
 *   npx --yes tsx scripts/lifetime-cutover-dry-run.ts path/to/accounts.json
 *
 * Input JSON: array of
 *   {
 *     "uid": string,
 *     "entitlementActive": boolean,
 *     "survivingCreateCount": number | null,
 *     "hasDeleteEvidence": boolean,
 *     "hasMissingHistoryGaps": boolean
 *   }
 *
 * Does NOT enable the policy live. Prints counts for owner approval.
 */

import { readFileSync } from "node:fs";

import {
  classifyLifetimeCutoverAccount,
  summarizeLifetimeCutoverDryRun,
  type LifetimeCutoverAccountClass,
} from "../src/billing/optionC/lifetimeAdmission";

type Row = {
  uid?: string;
  entitlementActive?: boolean;
  survivingCreateCount?: number | null;
  hasDeleteEvidence?: boolean;
  hasMissingHistoryGaps?: boolean;
};

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.log(
      JSON.stringify(
        {
          policy: "forward_only_proposal",
          enabledLive: false,
          message:
            "Pass a JSON array of account rows. Live enablement stays HOLD until the owner approves counts.",
          methodology: {
            paid_active: "entitlementActive === true",
            empty: "survivingCreateCount === 0 and no delete evidence",
            provable_history: "finite surviving creates with no deletes/gaps",
            ambiguous_history: "null count, deletes, or missing-history gaps",
          },
        },
        null,
        2
      )
    );
    return;
  }

  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Input must be a JSON array");
  }

  const classified: { uid: string; classification: LifetimeCutoverAccountClass }[] = [];
  for (const row of raw as Row[]) {
    const classification = classifyLifetimeCutoverAccount({
      entitlementActive: row.entitlementActive === true,
      survivingCreateCount:
        typeof row.survivingCreateCount === "number" || row.survivingCreateCount === null
          ? row.survivingCreateCount
          : null,
      hasDeleteEvidence: row.hasDeleteEvidence === true,
      hasMissingHistoryGaps: row.hasMissingHistoryGaps === true,
    });
    classified.push({ uid: String(row.uid ?? ""), classification });
  }

  const summary = summarizeLifetimeCutoverDryRun(classified);
  console.log(JSON.stringify({ ...summary, sampleSize: classified.length }, null, 2));
}

main();
