/**
 * Dev-only: report translated UI strings still rendered via raw <Text>.
 * Run: npm run audit:i18n-text
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "src"];

const SKIP_PATH_PARTS = [
  "/node_modules/",
  "/locales/",
  ".test.",
  "LocaleUiText.tsx",
  "languageTextStyle.ts",
];

const DATA_HINT =
  /\{(?!t\()[^}]*(?:format(?:INR|EntryDate|Amount|Number|Time|ShortDate)|\.(?:title|name|amount|value|email|phone|notes|body|subject|partyName|customerName|businessName|gstin|pan|ueid|pdfUri|pendingAmount|balance|quantity|unit|serial|invoice|reference|address|mobile|designation|dueLine|periodLine|applicability)|₹|user\.|entry\.|profile\.|p\.|payload|item\.|row\.|record\.|customer\.|party\.|amountLocale|message\b|recordLabel|error\b|permissionLabel|cat\.preview|amountWords|line\b|edited\b|rem\?\.|input\.)/;

interface Finding {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    if (SKIP_PATH_PARTS.some((p) => rel.includes(p))) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function auditFile(file: string): Finding[] {
  const rel = path.relative(ROOT, file);
  const source = fs.readFileSync(file, "utf8");
  const findings: Finding[] = [];
  if (!/\bt\s*\(/.test(source) && !/useT\s*\(/.test(source)) return findings;

  const re = /<Text(\s[^>]*)>([\s\S]*?)<\/Text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const inner = m[2]!;
    if (!/\bt\s*\(/.test(inner)) continue;
    const line = source.slice(0, m.index).split("\n").length;
    const snippet = m[0].split("\n")[0]!.trim().slice(0, 120);
    if (DATA_HINT.test(inner)) {
      findings.push({
        file: rel,
        line,
        snippet,
        reason: "mixed-or-data (manual review)",
      });
      continue;
    }
    findings.push({
      file: rel,
      line,
      snippet,
      reason: "t() inside Text — migrate to LocaleUiText",
    });
  }
  return findings;
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  const all = files.flatMap(auditFile);
  const migrate = all.filter((f) => f.reason.startsWith("t()"));
  const manual = all.filter((f) => !f.reason.startsWith("t()"));

  console.log(`# i18n Text audit`);
  console.log(`Files scanned: ${files.length}`);
  console.log(`LocaleUiText candidates: ${migrate.length}`);
  console.log(`Manual-review (data/mixed): ${manual.length}`);
  console.log("");

  const byFile = new Map<string, Finding[]>();
  for (const f of migrate) {
    const arr = byFile.get(f.file) ?? [];
    arr.push(f);
    byFile.set(f.file, arr);
  }
  for (const [file, rows] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`## ${file} (${rows.length})`);
    for (const row of rows.slice(0, 8)) {
      console.log(`  L${row.line}: ${row.snippet}`);
    }
    if (rows.length > 8) console.log(`  … +${rows.length - 8} more`);
  }

  if (manual.length > 0) {
    console.log("\n# Manual review (not auto-flagged for migration)");
    for (const row of manual.slice(0, 30)) {
      console.log(`  ${row.file}:${row.line} — ${row.reason}`);
    }
    if (manual.length > 30) console.log(`  … +${manual.length - 30} more`);
  }
}

main();
