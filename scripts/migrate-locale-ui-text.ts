/**
 * Dev utility: migrate simple <Text>{t("key")}</Text> → LocaleUiText.
 * Run: npx tsx scripts/migrate-locale-ui-text.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "src"];

const DATA_HINT =
  /\{(?!t\()[^}]*(?:format(?:INR|EntryDate|Amount|Number|Time)|\.(?:title|name|amount|value|email|phone|notes|body|subject|partyName|customerName|businessName|gstin|pan|ueid|pendingAmount|balance|quantity|serial|invoice|reference|address|mobile|designation)|₹|user\.|entry\.|profile\.|p\.|payload|item\.|row\.|record\.|customer\.|party\.)/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    if (rel.includes("/locales/") || rel.includes("LocaleUiText")) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function ensureImport(source: string): string {
  if (/LocaleUiText/.test(source)) return source;
  if (/from ["']@\/components\/ui["']/.test(source)) {
    return source.replace(
      /(import\s*\{[^}]*)(}\s*from\s*["']@\/components\/ui["'];)/,
      (m, a, b) => (a.includes("LocaleUiText") ? m : `${a}, LocaleUiText ${b}`)
    );
  }
  const firstImport = source.match(/^import .+;\n/m);
  if (firstImport) {
    const idx = source.indexOf(firstImport[0]) + firstImport[0].length;
    return (
      source.slice(0, idx) +
      'import { LocaleUiText } from "@/components/ui/LocaleUiText";\n' +
      source.slice(idx)
    );
  }
  return `import { LocaleUiText } from "@/components/ui/LocaleUiText";\n${source}`;
}

function isUiTranslationBlock(inner: string): boolean {
  const trimmed = inner.trim();
  if (DATA_HINT.test(inner)) return false;
  if (/^\{t\s*\([\s\S]+\)\}$/.test(trimmed)) return true;
  if (/^•\s*\{t\s*\([\s\S]+\)\}$/.test(trimmed)) return true;
  if (/^\{copied\s*\?\s*t\s*\([^}]+\)\s*:\s*t\s*\([^}]+\)\}$/.test(trimmed)) return true;
  return false;
}

function migrateContent(source: string, _rel: string): { next: string; count: number } {
  let count = 0;
  let next = source;

  const blockRe = /<Text(\s[^>]*)>([\s\S]*?)<\/Text>/g;
  next = next.replace(blockRe, (full, attrs, inner) => {
    if (!isUiTranslationBlock(inner)) return full;
    count++;
    return `<LocaleUiText${attrs}>${inner}</LocaleUiText>`;
  });

  if (count > 0) next = ensureImport(next);
  return { next, count };
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  let total = 0;
  let touched = 0;
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const source = fs.readFileSync(file, "utf8");
    if (!/\bt\s*\(/.test(source) && !/useT\s*\(/.test(source)) continue;
    const { next, count } = migrateContent(source, rel);
    if (count > 0) {
      fs.writeFileSync(file, next, "utf8");
      console.log(`${rel}: ${count}`);
      total += count;
      touched++;
    }
  }
  console.log(`\nMigrated ${total} Text blocks across ${touched} files.`);
}

main();
