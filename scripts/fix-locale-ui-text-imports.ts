import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function ensureImport(source: string): string | null {
  if (!/<LocaleUiText\b/.test(source)) return null;
  if (/import\s*\{[^}]*LocaleUiText/.test(source)) return null;

  const uiBarrel = source.match(/import\s*\{([^}]+)\}\s*from\s*["']@\/components\/ui["'];/);
  if (uiBarrel) {
    const items = uiBarrel[1]!.trim();
    const next = items.endsWith(",") || !items ? `${items} LocaleUiText` : `${items}, LocaleUiText`;
    return source.replace(uiBarrel[0], `import { ${next} } from "@/components/ui";`);
  }

  const firstImport = source.match(/^import .+;\n/m);
  const line = 'import { LocaleUiText } from "@/components/ui/LocaleUiText";\n';
  if (firstImport) {
    const idx = source.indexOf(firstImport[0]) + firstImport[0].length;
    return source.slice(0, idx) + line + source.slice(idx);
  }
  return line + source;
}

let fixed = 0;
for (const file of walk(path.join(ROOT, "app")).concat(walk(path.join(ROOT, "src")))) {
  const source = fs.readFileSync(file, "utf8");
  const next = ensureImport(source);
  if (next) {
    fs.writeFileSync(file, next, "utf8");
    console.log(path.relative(ROOT, file));
    fixed++;
  }
}
console.log(`Fixed imports in ${fixed} files.`);
