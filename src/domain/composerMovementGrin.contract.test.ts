import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MATERIAL_MOVEMENT_GRIN_OPTION,
  MATERIAL_MOVEMENT_SUB_OPTIONS,
  entryTypeForMovementKind,
} from "./composerOptions";
import { OFFLINE_PENDING_BANNER } from "@/goodsEvidence/constants";
import en from "@/i18n/locales/en.json";

/** GRIN is a separate Material Movement destination — never a material_received composer type. */
assert.equal(MATERIAL_MOVEMENT_GRIN_OPTION.id, "grin_create");
assert.equal(entryTypeForMovementKind("received"), "material_received");
assert.ok(
  MATERIAL_MOVEMENT_SUB_OPTIONS.every((o) => o.kind !== ("grin_create" as never)),
  "basic movement sub-options must not include GRIN"
);

const movementSrc = readFileSync(
  join(__dirname, "../../app/(app)/composer/movement.tsx"),
  "utf8"
);
assert.match(movementSrc, /isGoodsEvidenceEnabled/);
assert.match(movementSrc, /\/\(app\)\/grin\/create/);
assert.doesNotMatch(
  movementSrc,
  /entryTypeForMovementKind\(["']grin/,
  "GRIN must not route through material_received composer"
);
assert.match(movementSrc, /MATERIAL_MOVEMENT_SUB_OPTIONS\.map/);
assert.match(movementSrc, /MATERIAL_MOVEMENT_GRIN_OPTION/);

const noticesSrc = readFileSync(
  join(__dirname, "../screens/grin/GrinFixtureNotices.tsx"),
  "utf8"
);
assert.match(noticesSrc, /grinRepositoryIsFake/);
assert.doesNotMatch(noticesSrc, /This is not a fixture list/);
assert.doesNotMatch(noticesSrc, /pricingQuotaNote/);
assert.doesNotMatch(noticesSrc, /queueBanner/);

const options = (en as { composer: { options: Record<string, string> } }).composer.options;
assert.equal(options.movementGrin, "Goods receipt & inspection");
assert.match(options.movementGrinSub, /shortages or damage/i);
assert.match(options.movementReceivedSub, /without a GRIN/i);
assert.notEqual(options.movementReceived, options.movementGrin);

const grin = (en as { grin: { offlinePendingBanner: string; createTitle: string; pdf: { pendingNumber: string } } })
  .grin;
assert.equal(grin.offlinePendingBanner, OFFLINE_PENDING_BANNER);
assert.equal(grin.createTitle, "Goods receipt & inspection");
assert.match(grin.pdf.pendingNumber, /after registration/i);
assert.doesNotMatch(grin.pdf.pendingNumber, /^Pending registration$/);

console.log("composerMovementGrin.contract.test.ts: ok");
