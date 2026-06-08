import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN = ["app", "src"];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    if (rel.includes("/locales/") || rel.endsWith("LocaleUiText.tsx")) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const DATA_HINT =
  /\{(?!t\()[^}]*(?:format(?:INR|EntryDate|Amount|Number|Time|ShortDate)|\.(?:title|name|amount|value|email|phone|notes|body|subject|partyName|customerName|businessName|gstin|pan|ueid|pendingAmount|balance|quantity|serial|invoice|reference|address|mobile|designation|dueLine|periodLine|applicability)|₹|user\.|entry\.|profile\.|p\.|payload|item\.|row\.|record\.|customer\.|party\.|message\b|recordLabel|error\b|permissionLabel)/;

function main() {
  const files = SCAN.flatMap((d) => walk(path.join(ROOT, d)));
  const hits: Array<{ file: string; inner: string }> = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const re = /<Text(\s[^>]*)>([\s\S]*?)<\/Text>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const inner = m[2]!;
      if (!/\bt\s*\(/.test(inner)) continue;
      if (DATA_HINT.test(inner)) {
        console.log(`[data/mixed] ${path.relative(ROOT, file)}: ${inner.trim().slice(0, 100)}`);
        continue;
      }
      hits.push({ file: path.relative(ROOT, file), inner: inner.trim().slice(0, 120) });
    }
  }
  console.log(`\nUI Text blocks still using <Text> with t(): ${hits.length}`);
  for (const h of hits) console.log(`${h.file}: ${h.inner}`);
}

main();
