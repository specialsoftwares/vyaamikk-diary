/**
 * Dev utility: export TypeScript locale modules to JSON for react-i18next.
 * Run: npx tsx scripts/export-locales-to-json.ts
 */
import fs from "node:fs";
import path from "node:path";

import en from "../src/i18n/locales/en";
import hi from "../src/i18n/locales/hi";

const outDir = path.join(process.cwd(), "src/i18n/locales");

function writeJson(name: string, data: unknown) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Wrote ${file}`);
}

writeJson("en.json", en);
writeJson("hi.json", hi);
