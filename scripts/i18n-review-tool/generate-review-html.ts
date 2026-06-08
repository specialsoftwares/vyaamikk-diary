/**
 * Dev-only: embed flagged translation keys into a standalone review HTML page.
 * Run: npm run i18n:review:generate
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LOCALES = path.join(ROOT, "src/i18n/locales");
const OUT_DIR = path.join(ROOT, "scripts/i18n-review-tool");
const OUT_HTML = path.join(OUT_DIR, "review.html");

type LocaleJson = Record<string, unknown>;

function readJson(name: string): LocaleJson {
  return JSON.parse(fs.readFileSync(path.join(LOCALES, name), "utf8")) as LocaleJson;
}

function getByPath(obj: LocaleJson, keyPath: string): string {
  const parts = keyPath.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : "";
}

function main() {
  const flags = JSON.parse(
    fs.readFileSync(path.join(LOCALES, "translationReviewFlags.json"), "utf8")
  ) as {
    languages: Record<
      string,
      Record<string, { reason: string; english: string }>
    >;
  };

  const en = readJson("en.json");
  const ta = readJson("ta.json");
  const te = readJson("te.json");
  const gu = readJson("gu.json");

  const rows: Array<{
    key: string;
    reason: string;
    english: string;
    ta: string;
    te: string;
    gu: string;
  }> = [];

  const keySet = new Set<string>();
  for (const lang of ["ta", "te", "gu"]) {
    const bucket = flags.languages[lang] ?? {};
    for (const key of Object.keys(bucket)) keySet.add(key);
  }

  for (const key of [...keySet].sort()) {
    const reason =
      flags.languages.ta?.[key]?.reason ??
      flags.languages.te?.[key]?.reason ??
      flags.languages.gu?.[key]?.reason ??
      "domain-sensitive";
    const english =
      getByPath(en, key) ||
      flags.languages.ta?.[key]?.english ||
      flags.languages.te?.[key]?.english ||
      flags.languages.gu?.[key]?.english ||
      "";
    rows.push({
      key,
      reason,
      english,
      ta: getByPath(ta, key),
      te: getByPath(te, key),
      gu: getByPath(gu, key),
    });
  }

  const payload = JSON.stringify(rows);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Vyaamikk Diary — Translation Review</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f4f4f8; color: #14172b; }
  header { background: #1e1b4b; color: #fff; padding: 16px 20px; position: sticky; top: 0; z-index: 2; }
  header h1 { margin: 0 0 6px; font-size: 18px; }
  header p { margin: 0; font-size: 13px; opacity: .85; }
  .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  button { cursor: pointer; border: 0; border-radius: 8px; padding: 8px 12px; font-weight: 600; }
  .primary { background: #4f46e5; color: #fff; }
  .ghost { background: rgba(255,255,255,.15); color: #fff; }
  main { padding: 16px 20px 40px; max-width: 1200px; margin: 0 auto; }
  .card { background: #fff; border: 1px solid #e5e7f0; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
  .key { font-family: ui-monospace, monospace; font-size: 12px; color: #4f46e5; word-break: break-all; }
  .reason { font-size: 12px; color: #6b7280; margin: 4px 0 10px; }
  .grid { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; font-size: 13px; }
  .grid label { font-weight: 700; color: #374151; }
  textarea { width: 100%; min-height: 52px; font: inherit; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px; resize: vertical; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  .actions button { font-size: 12px; padding: 6px 10px; }
  .approve { background: #059669; color: #fff; }
  .keep { background: #e5e7eb; color: #111827; }
  .status { font-size: 11px; color: #6b7280; margin-left: 6px; }
</style>
</head>
<body>
<header>
  <h1>Translation review (${rows.length} flagged keys)</h1>
  <p>Tamil / Telugu / Gujarati domain-sensitive strings. Decisions export as JSON — apply locally with <code>npm run i18n:review:apply</code>.</p>
  <div class="toolbar">
    <button class="primary" id="exportBtn">Download decisions JSON</button>
    <button class="ghost" id="filterPendingBtn">Show pending only</button>
  </div>
</header>
<main id="list"></main>
<script>
const ROWS = ${payload};
const decisions = new Map();

function rowId(key, lang) { return key + "::" + lang; }

function render() {
  const list = document.getElementById("list");
  const pendingOnly = document.body.dataset.filterPending === "1";
  list.innerHTML = "";
  for (const row of ROWS) {
    for (const lang of ["ta", "te", "gu"]) {
      const id = rowId(row.key, lang);
      const d = decisions.get(id);
      if (pendingOnly && d) continue;
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = \`
        <div class="key">\${row.key}</div>
        <div class="reason">\${row.reason}</div>
        <div class="grid">
          <label>English</label><div>\${escapeHtml(row.english)}</div>
          <label>\${lang.toUpperCase()}</label>
          <div><textarea data-key="\${row.key}" data-lang="\${lang}" id="v-\${id}">\${escapeHtml(row[lang])}</textarea></div>
        </div>
        <div class="actions">
          <button class="approve" data-act="approve" data-key="\${row.key}" data-lang="\${lang}">Approve</button>
          <button class="keep" data-act="keep-english" data-key="\${row.key}" data-lang="\${lang}">Keep English</button>
          <span class="status" id="s-\${id}">\${d ? d.action : ""}</span>
        </div>\`;
      list.appendChild(card);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

document.getElementById("list").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const key = btn.dataset.key;
  const lang = btn.dataset.lang;
  const id = rowId(key, lang);
  const textarea = document.getElementById("v-" + id);
  const action = btn.dataset.act;
  let value = textarea.value;
  if (action === "keep-english") {
    const row = ROWS.find((r) => r.key === key);
    value = row ? row.english : value;
    textarea.value = value;
  }
  decisions.set(id, { key, lang, action: action === "approve" ? "approve" : action === "keep-english" ? "keep-english" : "edit", value });
  document.getElementById("s-" + id).textContent = decisions.get(id).action;
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const out = { exportedAt: new Date().toISOString(), decisions: [...decisions.values()] };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "translation-review-decisions.json";
  a.click();
});

document.getElementById("filterPendingBtn").addEventListener("click", () => {
  document.body.dataset.filterPending = document.body.dataset.filterPending === "1" ? "0" : "1";
  render();
});

render();
</script>
</body>
</html>`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_HTML, html, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT_HTML)} (${rows.length} keys × 3 languages)`);
}

main();
