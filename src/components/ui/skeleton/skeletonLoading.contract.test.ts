/**
 * Coverage — skeletonPanelMode. The panel calls it with hasContent=false
 * because its children are the skeleton. A slow initial load stays
 * "skeleton-and-slow" (skeleton remains). Loading false is "hidden".
 *
 * Updated:
 * - app/(app)/(tabs)/you.tsx — uses useDiaryList loading; content-shaped skeleton while the first load has no entries; ErrorState on failure with no entries; refresh keeps the dashboard.
 * - app/(app)/diary/work-team.tsx — list skeleton now goes through SkeletonLoadingPanel; a failed empty load no longer also shows the empty state.
 * - app/(app)/diary/material-movement.tsx — same as work team.
 * - app/(app)/customer-credit/index.tsx — fullscreen loader replaced; refresh keeps rows; a userId change drops the previous list.
 * - app/(app)/purchase-order/index.tsx — fullscreen loader replaced; an error with rows keeps the list; a userId change drops the previous list.
 * - app/(app)/professional-pack/history.tsx — blank initial list replaced with a skeleton; refresh keeps rows already on screen.
 * - app/(app)/settings/business-insights.tsx — initial dashboard load uses a skeleton; refresh keeps tiles when data is already present.
 * - app/(app)/settings/business-insights/parties.tsx — list skeleton instead of a spinner; refresh keeps rows.
 * - app/(app)/settings/business-insights/customers.tsx — list skeleton instead of a spinner; refresh keeps rows.
 * - app/(app)/settings/business-insights/cash-paid.tsx — list skeleton instead of a spinner; refresh keeps the figures.
 * - app/(app)/settings/business-insights/category/[category].tsx — list skeleton instead of a spinner; refresh keeps the category.
 * - app/(app)/settings/business-insights/recap/[fy].tsx — skeleton until a snapshot exists; a userId change clears the previous snapshot.
 *
 * Unchanged:
 * - app/(app)/diary/index.tsx — already mounts SkeletonLoadingPanel only when loading and the list is empty.
 * - app/(app)/diary/[id].tsx — record detail, not a list or dashboard.
 * - app/(app)/diary/edit/[id].tsx — edit form, not a list or dashboard.
 * - app/(app)/customer-credit/form.tsx — form, not a list.
 * - app/(app)/customer-credit/payment.tsx — form, not a list.
 * - app/(app)/customer-credit/close.tsx — form, not a list.
 * - app/(app)/customer-credit/[id].tsx — record detail, not a list.
 * - app/(app)/purchase-order/form.tsx — form, not a list.
 * - app/(app)/professional-pack/index.tsx — static category picker with no fetch.
 * - app/(app)/professional-pack/form.tsx — form, not a list.
 * - app/(app)/professional-pack/[id].tsx — record detail, not a list.
 * - src/screens/grin/GrinListScreen.tsx — synchronous local list and no loading flag.
 * - src/screens/grin/GrinHistoryScreen.tsx — synchronous local list and no loading flag.
 * - src/screens/grin/GrinReturnSelectAdmittedBody.tsx — text status around a synchronous read, not a fullscreen loader.
 * - src/screens/grin/GrinAttachmentsAdmittedBody.tsx — button busy spinners only.
 * - app/(app)/search.tsx — already uses SkeletonLoadingPanel; index reload hides rows so a previous account is not left on screen.
 * - app/(app)/(tabs)/settings.tsx — already uses SkeletonLoadingPanel while settings status is loading.
 * - app/(app)/settings/identity.tsx — profile form, not a list.
 * - app/(app)/(tabs)/calendar.tsx — already shows a skeleton when the selected day is empty.
 * - app/(app)/at-a-glance/[view].tsx — already shows a skeleton when the glance model is empty.
 * - app/(app)/drafts/index.tsx — already shows a skeleton when there are no drafts.
 * - src/screens/StatutoryInformationScreen.tsx — already shows a skeleton when the statutory view is absent.
 * - app/(app)/letterhead/history.tsx — fullscreen loader, outside the named diary/credit/order/pack/grin/attachment/insights/search/settings surfaces.
 * - app/(app)/letterhead/create.tsx — editor, outside those surfaces.
 * - auth, consent, errors, and functions — left untouched.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { skeletonPanelMode } from "./skeletonPanelMode";

const root = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(root, "SkeletonLoadingPanel.tsx"), "utf8");

assert.equal(skeletonPanelMode(false, false, false), "hidden");
assert.equal(skeletonPanelMode(false, true, false), "hidden");
assert.equal(skeletonPanelMode(false, false, true), "content");
assert.equal(skeletonPanelMode(false, true, true), "content");
assert.equal(skeletonPanelMode(true, false, true), "content");
assert.equal(skeletonPanelMode(true, true, true), "content");
assert.equal(skeletonPanelMode(true, false, false), "skeleton");
assert.equal(skeletonPanelMode(true, true, false), "skeleton-and-slow");

assert.match(panel, /skeletonPanelMode\(loading, slow, false\)/);
assert.match(panel, /\{children\}/);
assert.match(panel, /mode === "skeleton-and-slow"/);
assert.doesNotMatch(panel, /if \(slow\)/);

console.log("skeletonLoading.contract.test.ts: ok");
