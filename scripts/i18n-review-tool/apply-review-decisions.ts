/**
 * Apply exported translation review decisions to ta/te/gu locale JSON files.
 * Run: npm run i18n:review:apply -- --decisions path/to/decisions.json
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LOCALES = path.join(ROOT, "src/i18n/locales");

type LocaleJson = Record<string, unknown>;

interface Decision {
  key: string;
  lang: "ta" | "te" | "gu";
  action: "approve" | "keep-english" | "edit";
  value?: string;
}

function parseArgs(): string {
  const idx = process.argv.indexOf("--decisions");
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error("Usage: npm run i18n:review:apply -- --decisions path/to/decisions.json");
    process.exit(1);
  }
  return path.resolve(process.argv[idx + 1]!);
}

function readJson(file: string): LocaleJson {
  return JSON.parse(fs.readFileSync(file, "utf8")) as LocaleJson;
}

function writeJson(file: string, data: LocaleJson): void {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function setByPath(obj: LocaleJson, keyPath: string, value: string): void {
  const parts = keyPath.split(".");
  let cur: LocaleJson = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next == null || typeof next !== "object") cur[p] = {};
    cur = cur[p] as LocaleJson;
  }
  cur[parts[parts.length - 1]!] = value;
}

function validateLocale(file: string): void {
  const raw = fs.readFileSync(file, "utf8");
  JSON.parse(raw);
}

function main() {
  const decisionsPath = parseArgs();
  const payload = JSON.parse(fs.readFileSync(decisionsPath, "utf8")) as {
    decisions: Decision[];
  };
  const decisions = payload.decisions ?? [];
  if (decisions.length === 0) {
    console.error("No decisions found in file.");
    process.exit(1);
  }

  const en = readJson(path.join(LOCALES, "en.json"));
  const files: Record<"ta" | "te" | "gu", LocaleJson> = {
    ta: readJson(path.join(LOCALES, "ta.json")),
    te: readJson(path.join(LOCALES, "te.json")),
    gu: readJson(path.join(LOCALES, "gu.json")),
  };

  const statusPath = path.join(LOCALES, "translationReviewStatus.json");
  const status = fs.existsSync(statusPath)
    ? (readJson(statusPath) as { reviewed: Record<string, string> })
    : { reviewed: {} as Record<string, string> };

  let applied = 0;
  for (const d of decisions) {
    if (!["ta", "te", "gu"].includes(d.lang)) continue;
    let value = d.value ?? "";
    if (d.action === "keep-english") {
      const parts = d.key.split(".");
      let cur: unknown = en;
      for (const p of parts) {
        if (cur == null || typeof cur !== "object") break;
        cur = (cur as Record<string, unknown>)[p];
      }
      value = typeof cur === "string" ? cur : value;
    }
    if (!value.trim()) {
      console.warn(`Skip ${d.key} (${d.lang}) — empty value`);
      continue;
    }
    setByPath(files[d.lang], d.key, value);
    status.reviewed[`${d.lang}::${d.key}`] = d.action;
    applied++;
  }

  for (const lang of ["ta", "te", "gu"] as const) {
    const file = path.join(LOCALES, `${lang}.json`);
    writeJson(file, files[lang]);
    validateLocale(file);
    console.log(`Updated ${path.relative(ROOT, file)}`);
  }

  status.reviewed._lastAppliedAt = new Date().toISOString();
  writeJson(statusPath, status as unknown as LocaleJson);
  console.log(`Applied ${applied} decision(s). Status → ${path.relative(ROOT, statusPath)}`);
}

main();
