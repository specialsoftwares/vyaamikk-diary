import assert from "node:assert/strict";

import {
  changeAppLanguage,
  ensureLocaleBundle,
  getRegisteredLanguages,
  i18n,
  initI18n,
  translateSync,
} from "./i18n";
import { isLang, LANG_STORAGE_KEY, SUPPORTED_LANGS } from "./types";
import { validateLocaleSetup } from "./validateLocales";
import {
  __clearScriptFontCacheForTests,
  __setFontLoaderForTests,
  ensureScriptFontLoaded,
  isScriptFontLoaded,
  resolveLoadedLocaleFont,
} from "./localeFonts";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { formatEntryDate } from "@/utils/formatters/formatDate";
import { getLanguageTextStyle } from "@/i18n/languageTextStyle";
import { inrWordsLocaleFromLang } from "@/utils/money/inrWords";

async function run() {
  const report = await validateLocaleSetup();
  assert.equal(report.ok, true, "all locales registered");
  assert.deepEqual(report.registered, [...SUPPORTED_LANGS]);

  for (const code of SUPPORTED_LANGS) {
    assert.equal(isLang(code), true, `ISO code ${code}`);
  }

  assert.equal(isLang("tamil"), false);
  assert.equal(isLang("te-IN"), false);
  assert.equal(LANG_STORAGE_KEY, "vyd_language_v1");

  // ---- Lazy locale loading: only English is registered eagerly ----
  await initI18n("en");
  assert.deepEqual(
    getRegisteredLanguages(),
    ["en"],
    "en is the only eager bundle at init"
  );

  // Loading resolves the bundle and caches it.
  await ensureLocaleBundle("hi");
  assert.equal(i18n.hasResourceBundle("hi", "translation"), true);
  assert.deepEqual(getRegisteredLanguages(), ["en", "hi"]);
  // Second call is a cache hit — must not throw or duplicate.
  await ensureLocaleBundle("hi");
  assert.deepEqual(getRegisteredLanguages(), ["en", "hi"]);

  for (const lang of SUPPORTED_LANGS) {
    await changeAppLanguage(lang);
    const label = translateSync(lang, "settings.language");
    assert.ok(label && label.length > 0, `settings.language for ${lang}`);
  }

  await changeAppLanguage("en");
  assert.equal(
    translateSync("en", "settings.deleteAccountAndData"),
    "Delete Account & Data"
  );
  assert.equal(
    translateSync("en", "settings.deleteAccountSubtitle"),
    "Permanently remove your account and app-controlled data"
  );
  assert.notEqual(
    translateSync("en", "settings.deleteAccountAndData"),
    "settings.deleteAccountAndData"
  );

  await ensureLocaleBundle("hi");
  const hiDelete = translateSync("hi", "settings.deleteAccountAndData");
  assert.notEqual(hiDelete, "settings.deleteAccountAndData");
  assert.notEqual(hiDelete, "Delete Account & Data");
  assert.ok(hiDelete.includes("अकाउंट"));

  // After the loop every supported language has been loaded on demand.
  assert.deepEqual(getRegisteredLanguages(), [...SUPPORTED_LANGS]);

  await changeAppLanguage("ta");
  const taSave = translateSync("ta", "common.save");
  const hiSave = translateSync("hi", "common.save");
  const enSave = translateSync("en", "common.save");
  assert.notEqual(taSave, hiSave, "ta and hi should differ");
  assert.notEqual(taSave, enSave, "ta should not be raw English shell for common.save");

  const hiStyle = getLanguageTextStyle("hi", { fontSize: 15 });
  const enStyle = getLanguageTextStyle("en", { fontSize: 15 });
  assert.ok((hiStyle.lineHeight ?? 0) > (enStyle.lineHeight ?? 0));
  assert.equal(hiStyle.letterSpacing, 0);
  assert.deepEqual(enStyle, {});

  await changeAppLanguage("xx" as "en").catch(() => {
    /* invalid */
  });
  await initI18n("en");
  await changeAppLanguage("en");

  for (const lang of ["en", "hi", "ta", "te", "gu"]) {
    assert.equal(inrWordsLocaleFromLang(lang), "en-IN");
    const amount = formatAmount(123456);
    assert.match(amount, /₹1,23,456/);
    assert.ok(!/[०-९௦-௯౦-౯૦-૯]/.test(amount));
    const date = formatEntryDate(new Date(2026, 5, 4).getTime());
    assert.match(date, /4 Jun 2026/);
    assert.ok(!/[०-९]/.test(date));
  }

  // ---- Lazy script fonts: cache + safe fallback behaviour ----
  __clearScriptFontCacheForTests();

  // English needs no script font.
  assert.equal(await ensureScriptFontLoaded("en"), true);
  assert.equal(resolveLoadedLocaleFont("en"), undefined);

  // Node has no expo-font: loading fails SILENTLY → system-font fallback.
  __setFontLoaderForTests(null);
  assert.equal(await ensureScriptFontLoaded("hi"), false, "no loader → fallback");
  assert.equal(isScriptFontLoaded("hi"), false);
  assert.equal(resolveLoadedLocaleFont("hi"), undefined, "system fallback while unloaded");

  // Successful load is cached — the loader runs once per language.
  let loads = 0;
  __setFontLoaderForTests(async () => {
    loads += 1;
  });
  assert.equal(await ensureScriptFontLoaded("ta"), true);
  assert.equal(await ensureScriptFontLoaded("ta"), true);
  assert.equal(loads, 1, "font load cached after success");
  assert.equal(isScriptFontLoaded("ta"), true);
  assert.equal(resolveLoadedLocaleFont("ta"), "NotoSansTamil_400Regular");

  // A failed load is retried on the next request (not negatively cached).
  let attempts = 0;
  __setFontLoaderForTests(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("transient");
  });
  assert.equal(await ensureScriptFontLoaded("gu"), false, "first attempt fails safely");
  assert.equal(await ensureScriptFontLoaded("gu"), true, "retry succeeds");
  assert.equal(isScriptFontLoaded("gu"), true);

  __setFontLoaderForTests(undefined);
  __clearScriptFontCacheForTests();

  console.log("i18n.test.ts: ok");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
