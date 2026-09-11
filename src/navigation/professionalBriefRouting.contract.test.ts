/**
 * VYD-24 contract — Professional brief selection flow.
 *
 * Regression under test: the + New record picker's "Professional brief" row
 * was hard-routed to /(app)/professional-pack/form with category "ca_tax"
 * and the first creatable matter (gst_return_support), bypassing the intact
 * category -> matter selector screens. This locks:
 *
 * 1. you.tsx routes Professional brief to the category selector.
 * 2. The selector screens still wire category -> matters -> form.
 * 3. The matter registry integrity (3 categories, 20 matters, 1 retired,
 *    GST return support present and creatable).
 * 4. Every matter has an English label; legal copy stays intact.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  creatableMattersForCategory,
  isCreatableMatterType,
  RETIRED_MATTER_TYPES,
} from "@/domain/professionalPackCreatable";
import {
  getMatterDef,
  isProfessionalCategory,
  MATTERS_BY_CATEGORY,
  PROFESSIONAL_MATTER_TYPES,
} from "@/domain/professionalPackMatters";
import en from "@/i18n/locales/en";

const root = join(__dirname, "../..");

// ---------------------------------------------------------------------------
// 1. Dashboard picker routes to the selector, never straight to a form.
// ---------------------------------------------------------------------------

const youTab = readFileSync(join(root, "app/(app)/(tabs)/you.tsx"), "utf8");
const proPackBranch = youTab.slice(youTab.indexOf("routesToProfessionalPack) {"));
assert.match(
  proPackBranch.slice(0, 600),
  /pathname:\s*"\/\(app\)\/professional-pack"/,
  "Professional brief must open /(app)/professional-pack (category selector)"
);
assert.doesNotMatch(
  youTab,
  /professional-pack\/form/,
  "you.tsx must not deep-link into the professional-pack form"
);
assert.doesNotMatch(
  youTab,
  /creatableMattersForCategory/,
  "you.tsx must not pre-pick a matter for the user"
);
assert.match(proPackBranch.slice(0, 600), /fromPicker:\s*"1"/);

// ---------------------------------------------------------------------------
// 2. Selector screens: category list -> matter list -> form.
// ---------------------------------------------------------------------------

const categoryScreen = readFileSync(
  join(root, "app/(app)/professional-pack/index.tsx"),
  "utf8"
);
assert.match(categoryScreen, /"ca_tax",\s*"cs_compliance",\s*"legal"/);
assert.match(categoryScreen, /pathname:\s*"\/\(app\)\/professional-pack\/matters"/);

const mattersScreen = readFileSync(
  join(root, "app/(app)/professional-pack/matters.tsx"),
  "utf8"
);
assert.match(mattersScreen, /creatableMattersForCategory\(category\)/);
assert.match(mattersScreen, /pathname:\s*"\/\(app\)\/professional-pack\/form"/);

// ---------------------------------------------------------------------------
// 3. Registry integrity — the taxonomy the selector exposes.
// ---------------------------------------------------------------------------

assert.equal(PROFESSIONAL_MATTER_TYPES.length, 20, "20 matter definitions");
assert.equal(MATTERS_BY_CATEGORY.ca_tax.length, 6);
assert.equal(MATTERS_BY_CATEGORY.cs_compliance.length, 6);
assert.equal(MATTERS_BY_CATEGORY.legal.length, 8);

for (const cat of ["ca_tax", "cs_compliance", "legal"] as const) {
  assert.ok(isProfessionalCategory(cat));
  const creatable = creatableMattersForCategory(cat);
  assert.ok(creatable.length > 0, `${cat} must offer creatable matters`);
  for (const m of creatable) {
    assert.equal(m.category, cat);
    assert.ok(isCreatableMatterType(m.type));
  }
}

// GST support must remain reachable: CA / Tax -> GST return support.
const gst = getMatterDef("ca_tax", "gst_return_support");
assert.ok(gst, "gst_return_support must exist under ca_tax");
assert.ok(isCreatableMatterType("gst_return_support"));
assert.ok(
  creatableMattersForCategory("ca_tax").some((m) => m.type === "gst_return_support")
);

// Retired matters stay readable but never creatable.
assert.deepEqual([...RETIRED_MATTER_TYPES], ["expense_cash_review"]);
assert.equal(isCreatableMatterType("expense_cash_review"), false);
assert.equal(
  creatableMattersForCategory("ca_tax").some((m) => m.type === "expense_cash_review"),
  false
);
assert.equal(
  PROFESSIONAL_MATTER_TYPES.filter((m) => isCreatableMatterType(m.type)).length,
  19,
  "19 creatable matters (20 minus the retired review type)"
);

// ---------------------------------------------------------------------------
// 4. Labels + legal copy.
// ---------------------------------------------------------------------------

type LocaleShape = {
  proPack: {
    matters: Record<string, string>;
    categories: Record<string, string>;
    categoryLead: string;
    formDisclaimer: string;
  };
};
const locale = en as unknown as LocaleShape;

for (const m of PROFESSIONAL_MATTER_TYPES) {
  const label = locale.proPack.matters[m.labelKey];
  assert.ok(
    typeof label === "string" && label.length > 0,
    `en label missing for matter ${m.type} (proPack.matters.${m.labelKey})`
  );
}
for (const cat of ["ca_tax", "cs_compliance", "legal"]) {
  assert.ok(locale.proPack.categories[cat], `en label missing for category ${cat}`);
  assert.ok(locale.proPack.categories[`${cat}Sub`], `en sub missing for ${cat}`);
}

// Legal/business wording must not drift in this fix (verbatim freeze).
assert.equal(
  locale.proPack.formDisclaimer,
  "This brief is based solely on information you enter. It is for sharing with an independent CA, CS, or lawyer and must be verified by them before use. The app does not verify facts, file returns, or create a professional-client relationship."
);
assert.equal(
  locale.proPack.categoryLead,
  "Prepare a structured brief to share with your own independent professional. Vyaamikk Diary does not provide tax, legal, or compliance advice and does not file returns or draft final notices for you."
);

console.log("professionalBriefRouting.contract.test.ts: ok");
