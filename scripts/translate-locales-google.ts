/**
 * Dev-only: generate ta/te/gu locale drafts from en.json.
 *
 * Official (preferred):
 *   GOOGLE_TRANSLATE_API_KEY=... npm run i18n:translate-draft
 *
 * Also reads GOOGLE_TRANSLATE_API_KEY from `.env` if present (never commit `.env`).
 *
 * Without the official API key, uses an unofficial Google Translate draft endpoint
 * for local dev only — review output before shipping.
 */
import fs from "node:fs";
import path from "node:path";

import { isDomainSensitive } from "../src/i18n/domainTerms";

const ROOT = process.cwd();
const LOCALES_DIR = path.join(ROOT, "src/i18n/locales");
const REPORT_PATH = path.join(ROOT, "scripts/translate-locales-report.md");
const FLAGS_PATH = path.join(LOCALES_DIR, "translationReviewFlags.json");

type JsonTree = Record<string, unknown>;

const TARGETS = [
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "gu", name: "Gujarati" },
] as const;

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 80;

function loadApiKey(): string | null {
  const direct = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (direct) return direct;
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return null;
  const line = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.startsWith("GOOGLE_TRANSLATE_API_KEY="));
  if (!line) return null;
  const value = line.slice("GOOGLE_TRANSLATE_API_KEY=".length).trim();
  return value.length > 0 ? value : null;
}

function readJson(file: string): JsonTree {
  return JSON.parse(fs.readFileSync(file, "utf8")) as JsonTree;
}

function writeJson(file: string, data: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function flattenStrings(
  node: unknown,
  prefix = "",
  out: { key: string; value: string }[] = []
): { key: string; value: string }[] {
  if (typeof node === "string") {
    if (prefix) out.push({ key: prefix, value: node });
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const next = prefix ? `${prefix}.${k}` : k;
      flattenStrings(v, next, out);
    }
  }
  return out;
}

function unflatten(entries: { key: string; value: string }[]): JsonTree {
  const root: JsonTree = {};
  for (const { key, value } of entries) {
    const parts = key.split(".");
    let cur: JsonTree = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      if (!(p in cur) || typeof cur[p] !== "object") cur[p] = {};
      cur = cur[p] as JsonTree;
    }
    cur[parts[parts.length - 1]!] = value;
  }
  return root;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function googleCloudTranslateBatch(
  texts: string[],
  target: string,
  apiKey: string
): Promise<string[]> {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: texts, target, format: "text", source: "en" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Cloud Translate failed (${res.status}): ${body.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    data?: { translations?: { translatedText: string }[] };
  };
  return (json.data?.translations ?? []).map((r) => r.translatedText);
}

/** Dev draft fallback — unofficial endpoint only translates one `q` per request. */
async function unofficialTranslateOne(text: string, target: string): Promise<string> {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: target,
    dt: "t",
    q: text,
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Unofficial translate failed (${res.status})`);
  const json = (await res.json()) as unknown;
  const row = Array.isArray(json) && Array.isArray(json[0]) ? json[0][0] : null;
  const translated = Array.isArray(row) && typeof row[0] === "string" ? row[0] : text;
  return translated;
}

async function unofficialTranslateBatch(texts: string[], target: string): Promise<string[]> {
  const out: string[] = [];
  for (const text of texts) {
    out.push(await unofficialTranslateOne(text, target));
    await sleep(40);
  }
  return out;
}

async function translateBatch(
  texts: string[],
  target: string,
  apiKey: string | null
): Promise<string[]> {
  if (apiKey) return googleCloudTranslateBatch(texts, target, apiKey);
  return unofficialTranslateBatch(texts, target);
}

async function translateTree(
  enTree: JsonTree,
  targetCode: string,
  apiKey: string | null
): Promise<{
  tree: JsonTree;
  flagged: Record<string, { reason: string; english: string }>;
}> {
  const flat = flattenStrings(enTree);
  const flagged: Record<string, { reason: string; english: string }> = {};
  const entries: { key: string; value: string }[] = [];
  const pending: { key: string; value: string }[] = [];

  for (const row of flat) {
    if (isDomainSensitive(row.key, row.value)) {
      flagged[row.key] = { reason: "domain-sensitive", english: row.value };
      entries.push({ key: row.key, value: row.value });
    } else {
      pending.push(row);
    }
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const slice = pending.slice(i, i + BATCH_SIZE);
    const translated = await translateBatch(
      slice.map((r) => r.value),
      targetCode,
      apiKey
    );
    for (let j = 0; j < slice.length; j++) {
      entries.push({ key: slice[j]!.key, value: translated[j] ?? slice[j]!.value });
    }
    if (i + BATCH_SIZE < pending.length) await sleep(BATCH_DELAY_MS);
    process.stdout.write(
      `  ${targetCode}: ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}\r`
    );
  }
  process.stdout.write("\n");

  const tree = unflatten(entries);
  if (tree.language && typeof tree.language === "object") {
    const langBlock = tree.language as JsonTree;
    langBlock.en = "English";
    langBlock.hi = "हिन्दी";
    langBlock.ta = "தமிழ்";
    langBlock.te = "తెలుగు";
    langBlock.gu = "ગુજરાતી";
  }
  return { tree, flagged };
}

async function main() {
  const enPath = path.join(LOCALES_DIR, "en.json");
  const enTree = readJson(enPath);
  const apiKey = loadApiKey();

  const report: string[] = [
    "# Locale translation report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    apiKey
      ? "Mode: Google Cloud Translation API (official key)"
      : "Mode: unofficial dev draft translator (set GOOGLE_TRANSLATE_API_KEY in env or .env for official API)",
    "",
  ];

  if (!apiKey) {
    console.log(
      "No GOOGLE_TRANSLATE_API_KEY found — using dev draft translator.\n" +
        "Add GOOGLE_TRANSLATE_API_KEY to .env for official Google Cloud Translation API.\n"
    );
  }

  const allFlags: Record<string, Record<string, { reason: string; english: string }>> = {};

  for (const target of TARGETS) {
    console.log(`Translating ${target.name} (${target.code})…`);
    const { tree, flagged } = await translateTree(enTree, target.code, apiKey);
    const outPath = path.join(LOCALES_DIR, `${target.code}.json`);
    writeJson(outPath, tree);
    allFlags[target.code] = flagged;
    report.push(`## ${target.name} (\`${target.code}.json\`)`);
    report.push(`- Output: \`${outPath}\``);
    report.push(`- Domain-sensitive keys kept in English: ${Object.keys(flagged).length}`);
    report.push("");
  }

  writeJson(FLAGS_PATH, {
    generatedAt: new Date().toISOString(),
    mode: apiKey ? "google-cloud-api" : "dev-draft-unofficial",
    languages: allFlags,
  });

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`, "utf8");
  console.log(`Wrote ${FLAGS_PATH}`);
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
