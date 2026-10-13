import assert from "node:assert/strict";

import en from "@/i18n/locales/en.json";
import { previousTabRouteName, selectedTabRouteName } from "@/navigation/tabRouteSelection";
import { mayMountNativeMapView } from "@/services/maps/mapNativeConfig";
import {
  headerBandHeightPct,
  suggestLetterheadPlacement,
  writingMarginsForHeader,
} from "@/services/letterhead/letterheadPlacement";
import { letterheadSetupFailureMessage } from "@/services/letterhead/letterheadSetupSaveError";
import {
  freezeLetterheadTemplateSnapshot,
  resolveHistoricalLetterhead,
} from "@/services/letterhead/letterheadTemplateSnapshot";
import { composeLetterheadHtml } from "@/services/pdf/letterheadPdfHtml";
import { isShareSheetCancellation } from "@/services/pdf/shareCancellation";
import { formatINR } from "@/utils/money/inr";
import type { LetterheadConfig } from "@/services/letterhead/types";

const UNCHANGED = "Could not save; your current letterhead is unchanged.";

function config(partial: Partial<LetterheadConfig> & Pick<LetterheadConfig, "updatedAt">): LetterheadConfig {
  return {
    userId: "owner",
    sourceType: "imported_image",
    imageWidth: 1000,
    imageHeight: 200,
    imageDataUri: null,
    letterheadImageStoragePath: "users/owner/letterhead/a.jpg",
    letterheadImageDownloadUrl: "https://example.invalid/a.jpg",
    margins: { topPct: 19, bottomPct: 11, leftPct: 12, rightPct: 12 },
    placement: "header_logo",
    repeatTemplateAllPages: true,
    createdAt: partial.updatedAt,
    ...partial,
  };
}

const tabs = {
  index: 3,
  routes: [
    { key: "calendar", name: "calendar" },
    { key: "you", name: "you" },
    { key: "records", name: "saved-records" },
    { key: "settings", name: "settings" },
  ],
  history: [
    { type: "route", key: "you" },
    { type: "route", key: "settings" },
  ],
};

assert.equal(selectedTabRouteName(tabs), "settings");
assert.equal(previousTabRouteName(tabs), "you");
assert.equal(
  previousTabRouteName({ ...tabs, index: 0, history: [{ type: "route", key: "calendar" }] }),
  null
);

assert.equal(mayMountNativeMapView({ platform: "android", androidApiKey: "" }), false);
assert.equal(mayMountNativeMapView({ platform: "android", androidApiKey: "present" }), true);
assert.equal(mayMountNativeMapView({ platform: "ios", androidApiKey: null }), true);

assert.equal(suggestLetterheadPlacement(1600, 280), "header_logo");
assert.equal(suggestLetterheadPlacement(1240, 1754), "complete_page");
const band = headerBandHeightPct(1600, 280);
assert.ok(band >= 12 && band <= 42);
const margins = writingMarginsForHeader(1600, 280);
assert.ok(margins.topPct > band);
assert.ok(margins.topPct + margins.bottomPct <= 80);

const specific = letterheadSetupFailureMessage({
  error: "Local file missing or size unknown for Storage upload.",
  needImage: "need",
  loadFailed: "load",
  unchanged: UNCHANGED,
});
assert.match(specific ?? "", /Local file missing/);
assert.match(specific ?? "", /unchanged/);
assert.equal(
  letterheadSetupFailureMessage({
    error: "session_retired",
    needImage: "need",
    loadFailed: "load",
    unchanged: UNCHANGED,
  }),
  UNCHANGED
);

const templateA = config({ updatedAt: 10, letterheadImageStoragePath: "users/owner/letterhead/a.jpg" });
const templateB = config({
  updatedAt: 20,
  letterheadImageStoragePath: "users/owner/letterhead/b.jpg",
  placement: "complete_page",
});
const snapA = freezeLetterheadTemplateSnapshot(templateA);
const saved = {
  userId: "owner",
  templateRefUpdatedAt: templateA.updatedAt,
  templateSnapshot: snapA,
};
const afterReplace = resolveHistoricalLetterhead(saved, templateB);
assert.equal(afterReplace.kind, "snapshot");
if (afterReplace.kind === "snapshot") {
  assert.equal(afterReplace.config.letterheadImageStoragePath, "users/owner/letterhead/a.jpg");
  assert.equal(afterReplace.config.placement, "header_logo");
}
const fresh = resolveHistoricalLetterhead(
  { userId: "owner", templateRefUpdatedAt: templateB.updatedAt, templateSnapshot: null },
  templateB
);
assert.equal(fresh.kind, "live_unchanged");
if (fresh.kind === "live_unchanged") {
  assert.equal(fresh.config.letterheadImageStoragePath, "users/owner/letterhead/b.jpg");
}
assert.equal(
  resolveHistoricalLetterhead(
    { userId: "owner", templateRefUpdatedAt: 10, templateSnapshot: null },
    templateB
  ).kind,
  "unavailable"
);

const headerHtml = composeLetterheadHtml({
  config: templateA,
  doc: {
    title: "",
    date: Date.UTC(2026, 9, 13),
    subject: "Subject",
    body: "Message",
    closing: "",
    name: "Sender",
    designation: "",
    place: "",
  },
  labels: { subject: "Subject", date: "Date", reference: "Ref", to: "To" },
  templateSrc: "https://example.invalid/a.jpg",
});
assert.match(headerHtml.html, /class="letterhead-header"/);
assert.doesNotMatch(headerHtml.html, /class="letterhead-bg"/);
const pageHtml = composeLetterheadHtml({
  config: { ...templateB, placement: "complete_page" },
  doc: {
    title: "",
    date: Date.UTC(2026, 9, 13),
    subject: "Subject",
    body: "Message",
    closing: "",
    name: "Sender",
    designation: "",
    place: "",
  },
  labels: { subject: "Subject", date: "Date", reference: "Ref", to: "To" },
  templateSrc: "https://example.invalid/b.jpg",
});
assert.match(pageHtml.html, /class="letterhead-bg"/);
assert.match(pageHtml.html, /object-fit:\s*contain/);

const amount = formatINR(5000);
const line = (en as { composer: { summary: { cash: string } } }).composer.summary.cash
  .replace("{{amount}}", amount)
  .replace("{{name}}", "Yash");
assert.equal(line, "₹5,000 to Yash");
assert.doesNotMatch(line, /₹₹/);
assert.equal((en as { calendarMaps: { tabLabel: string } }).calendarMaps.tabLabel, "VyaaFlow");
assert.equal((en as { savedRecords: { tabLabel: string } }).savedRecords.tabLabel, "Records");
assert.equal((en as { settings: { tabLabel: string } }).settings.tabLabel, "Settings");
assert.equal((en as { you: { statsThisWeek: string } }).you.statsThisWeek, "This week");

assert.equal(isShareSheetCancellation(new Error("User cancelled the share sheet")), true);
assert.equal(isShareSheetCancellation(new Error("Storage upload failed")), false);

console.log("vc25PhoneRepair.test.ts: ok");
