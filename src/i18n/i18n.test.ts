import assert from "node:assert/strict";

import { changeAppLanguage, getRegisteredLanguages, initI18n, translateSync } from "./i18n";
import { isLang, LANG_STORAGE_KEY, SUPPORTED_LANGS } from "./types";
import { validateLocaleSetup } from "./validateLocales";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { formatEntryDate } from "@/utils/formatters/formatDate";
import { getLanguageTextStyle } from "@/i18n/languageTextStyle";
import { inrWordsLocaleFromLang } from "@/utils/money/inrWords";

async function run() {
  const report = validateLocaleSetup();
  assert.equal(report.ok, true, "all locales registered");
  assert.deepEqual(report.registered, [...SUPPORTED_LANGS]);

  for (const code of SUPPORTED_LANGS) {
    assert.equal(isLang(code), true, `ISO code ${code}`);
  }

  assert.equal(isLang("tamil"), false);
  assert.equal(isLang("te-IN"), false);
  assert.equal(LANG_STORAGE_KEY, "vyd_language_v1");

  await initI18n("en");
  assert.deepEqual(getRegisteredLanguages(), [...SUPPORTED_LANGS]);

  for (const lang of SUPPORTED_LANGS) {
    await changeAppLanguage(lang);
    const label = translateSync(lang, "settings.language");
    assert.ok(label && label.length > 0, `settings.language for ${lang}`);
  }

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

  console.log("i18n.test.ts: ok");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
