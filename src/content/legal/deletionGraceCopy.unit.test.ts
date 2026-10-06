/**
 * In-app deletion copy must follow DELETION_GRACE_DAYS so a later 45-day
 * constant change cannot keep shipping hardcoded 15-day privacy text.
 * This test does not change the grace constant (Team 2).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PRIVACY_POLICY_SECTIONS } from "@/content/legal/documents";
import { DELETION_GRACE_DAYS } from "@/domain/identityLifecycle";

const root = resolve(__dirname, "../../..");

const documentsSrc = readFileSync(
  resolve(root, "src/content/legal/documents.ts"),
  "utf8"
);
assert.match(documentsSrc, /DELETION_GRACE_DAYS/);
assert.doesNotMatch(documentsSrc, /starts a 15-day grace period/);

const privacy = PRIVACY_POLICY_SECTIONS.find((s) => s.title === "Retention & deletion");
assert.ok(privacy);
assert.ok(
  privacy.paragraphs.some((p) => p.includes(`${DELETION_GRACE_DAYS}-day grace period`))
);

const deleteScreen = readFileSync(
  resolve(root, "app/(app)/settings/delete.tsx"),
  "utf8"
);
assert.match(deleteScreen, /DELETION_GRACE_DAYS/);

const pendingScreen = readFileSync(
  resolve(root, "app/(auth)/account-pending-deletion.tsx"),
  "utf8"
);
assert.match(pendingScreen, /DELETION_GRACE_DAYS/);

const en = readFileSync(resolve(root, "src/i18n/locales/en.ts"), "utf8");
assert.match(en, /\{\{days\}\}-day deletion period/);
assert.match(en, /\{\{days\}\}-day period/);

console.log("deletionGraceCopy.unit.test.ts: ok");
