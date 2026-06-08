/**
 * Dev-only: convert assets/*.HEIC → public-site/assets/screenshots (WebP + PNG).
 * Uses macOS `sips` for HEIC decode/resize; `npx sharp-cli` for WebP when available.
 *
 * Never imported by the Expo app runtime.
 *
 * Usage:
 *   npm run prepare:public-screenshots
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const HEIC_DIR = path.join(ROOT, "assets");
const OUT_DIR = path.join(ROOT, "public-site", "assets", "screenshots");
const MANIFEST_PATH = path.join(OUT_DIR, "screenshots.manifest.json");
const DATA_JS_PATH = path.join(ROOT, "public-site", "screenshots-data.js");

const MOBILE_WIDTH = 430;
const RETINA_WIDTH = 860;

type ShowcaseSection =
  | "daily-workspace"
  | "business-records"
  | "material-movement"
  | "professional-documents"
  | "multilingual"
  | "settings-privacy";

interface ScreenshotSpec {
  heic: string;
  id: string;
  category: string;
  language: string;
  title: string;
  caption: string;
  alt: string;
  showcaseSection: ShowcaseSection;
  safeForPublic: boolean;
  privacyNote?: string;
  skip?: boolean;
}

const SPECS: ScreenshotSpec[] = [
  {
    heic: "IMG_1627.HEIC",
    id: "boot-branding-en",
    category: "branding",
    language: "English",
    title: "Vyaamikk Diary brand",
    caption: "Premium indigo workspace for disciplined business records.",
    alt: "Vyaamikk Diary splash screen with Records, Invoices, Ledger and PDF labels",
    showcaseSection: "daily-workspace",
    safeForPublic: false,
    privacyNote: "Branding splash only — not used in public showcase (mock UI preferred).",
    skip: true,
  },
  {
    heic: "IMG_1629.HEIC",
    id: "location-access-en",
    category: "settings",
    language: "English",
    title: "Location access control",
    caption: "Foreground-only location footprints with clear permission copy.",
    alt: "Vyaamikk Diary Business Footprint screen explaining optional location access",
    showcaseSection: "settings-privacy",
    safeForPublic: true,
  },
  {
    heic: "IMG_1630.HEIC",
    id: "dashboard-en",
    category: "dashboard",
    language: "English",
    title: "Your business dashboard",
    caption: "A clean daily workspace for records, drafts and insights.",
    alt: "Vyaamikk Diary You dashboard in English with search and at-a-glance summaries",
    showcaseSection: "daily-workspace",
    safeForPublic: false,
    privacyNote: "Contains demo profile name and registered company name — exclude until redacted or approved.",
  },
  {
    heic: "IMG_1631.HEIC",
    id: "dashboard-hi",
    category: "dashboard",
    language: "Hindi",
    title: "व्यवसाय डैशबोर्ड",
    caption: "रिकॉर्ड, ड्राफ्ट और जानकारी के लिए साफ़ दैनिक कार्यक्षेत्र।",
    alt: "Vyaamikk Diary dashboard in Hindi showing business profile and record summaries",
    showcaseSection: "multilingual",
    safeForPublic: false,
    privacyNote: "Contains demo profile name and registered company name — exclude until redacted or approved.",
  },
  {
    heic: "IMG_1632.HEIC",
    id: "dashboard-ta",
    category: "dashboard",
    language: "Tamil",
    title: "வணிக டாஷ்போர்டு",
    caption: "பதிவுகள், வரைவுகள் மற்றும் நுண்ணறிவுகளுக்கான தினசரி பணிமனை.",
    alt: "Vyaamikk Diary dashboard in Tamil with multilingual navigation",
    showcaseSection: "multilingual",
    safeForPublic: false,
    privacyNote: "Contains demo profile name and registered company name — exclude until redacted or approved.",
  },
  {
    heic: "IMG_1634.HEIC",
    id: "dashboard-te",
    category: "dashboard",
    language: "Telugu",
    title: "వ్యాపార డాష్‌బోర్డ్",
    caption: "రికార్డులు, డ్రాఫ్ట్‌లు మరియు ఇన్‌సైట్‌ల కోసం స్వచ్ఛమైన రోజువారీ వర్క్‌స్పేస్.",
    alt: "Vyaamikk Diary dashboard in Telugu with at-a-glance record tiles",
    showcaseSection: "multilingual",
    safeForPublic: false,
    privacyNote: "Contains demo profile name and registered company name — exclude until redacted or approved.",
  },
  {
    heic: "IMG_1635.HEIC",
    id: "dashboard-gu",
    category: "dashboard",
    language: "Gujarati",
    title: "વ્યવસાય ડેશબોર્ડ",
    caption: "રેકોર્ડ, ડ્રાફ્ટ અને ઇનસાઇટ માટે સ્વચ્છ દૈનિક વર્કસ્પેસ.",
    alt: "Vyaamikk Diary dashboard in Gujarati with business identity card",
    showcaseSection: "multilingual",
    safeForPublic: false,
    privacyNote: "Contains demo profile name and registered company name — exclude until redacted or approved.",
  },
  {
    heic: "IMG_1636.HEIC",
    id: "new-record-gu",
    category: "new-record",
    language: "Gujarati",
    title: "નવો રેકોર્ડ",
    caption: "ચુકવણી, દુકાન, PO અને દસ્તાવેજ — એક જ સંગ્રહિત મેનુ.",
    alt: "Vyaamikk Diary new record menu in Gujarati listing payment, Dukaan and purchase order types",
    showcaseSection: "multilingual",
    safeForPublic: true,
  },
  {
    heic: "IMG_1637.HEIC",
    id: "new-record-en",
    category: "new-record",
    language: "English",
    title: "New record hub",
    caption: "Payment requests, Dukaan, purchase orders, movement and documents in one place.",
    alt: "Vyaamikk Diary new record selection screen in English",
    showcaseSection: "business-records",
    safeForPublic: true,
  },
  {
    heic: "IMG_1638.HEIC",
    id: "new-record-hi",
    category: "new-record",
    language: "Hindi",
    title: "नया रिकॉर्ड",
    caption: "भुगतान, दुकान, PO और दस्तावेज़ — एक संरचित मेनू।",
    alt: "Vyaamikk Diary new record menu in Hindi with business record categories",
    showcaseSection: "multilingual",
    safeForPublic: true,
  },
  {
    heic: "IMG_1641.HEIC",
    id: "new-record-gu-dup",
    category: "new-record",
    language: "Gujarati",
    title: "Duplicate",
    caption: "Duplicate of new-record-gu",
    alt: "Duplicate",
    showcaseSection: "multilingual",
    safeForPublic: false,
    skip: true,
    privacyNote: "Duplicate of IMG_1636 — skipped.",
  },
  {
    heic: "IMG_1642.HEIC",
    id: "new-record-te",
    category: "new-record",
    language: "Telugu",
    title: "కొత్త రికార్డు",
    caption: "చెల్లింపు, దుకాణం, PO మరియు పత్రాలు — ఒకే మెనూ.",
    alt: "Vyaamikk Diary new record menu in Telugu",
    showcaseSection: "multilingual",
    safeForPublic: true,
  },
  {
    heic: "IMG_1643.HEIC",
    id: "statutory-info-en",
    category: "statutory",
    language: "English",
    title: "Statutory information",
    caption: "Informational GST, Income Tax and compliance due-date prompts.",
    alt: "Vyaamikk Diary Statutory Information screen with GST and Income Tax filters",
    showcaseSection: "daily-workspace",
    safeForPublic: true,
  },
];

function run(cmd: string): void {
  execSync(cmd, { stdio: "inherit" });
}

function hasSips(): boolean {
  try {
    execSync("which sips", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resizePng(src: string, dest: string, width: number): void {
  run(`sips -Z ${width} "${src}" --out "${dest}"`);
}

function toWebp(src: string, dest: string): boolean {
  try {
    run(`npx --yes sharp-cli -i "${src}" -o "${dest}" -f webp -q 82`);
    return true;
  } catch {
    console.warn(`WebP conversion failed for ${src}; PNG fallback only.`);
    return false;
  }
}

function convertOne(spec: ScreenshotSpec): Record<string, unknown> | null {
  if (spec.skip) {
    console.log(`skip ${spec.heic} (${spec.id})`);
    return null;
  }

  const heicPath = path.join(HEIC_DIR, spec.heic);
  if (!fs.existsSync(heicPath)) {
    console.warn(`missing ${heicPath}`);
    return null;
  }

  const tmpPng = path.join(OUT_DIR, `.tmp-${spec.id}.png`);
  run(`sips -s format png "${heicPath}" --out "${tmpPng}"`);

  const mobilePng = path.join(OUT_DIR, `${spec.id}.png`);
  const retinaPng = path.join(OUT_DIR, `${spec.id}@2x.png`);
  resizePng(tmpPng, mobilePng, MOBILE_WIDTH);
  resizePng(tmpPng, retinaPng, RETINA_WIDTH);
  fs.unlinkSync(tmpPng);

  const mobileWebp = path.join(OUT_DIR, `${spec.id}.webp`);
  const retinaWebp = path.join(OUT_DIR, `${spec.id}@2x.webp`);
  const hasWebp = toWebp(mobilePng, mobileWebp);
  if (hasWebp) toWebp(retinaPng, retinaWebp);

  const entry: Record<string, unknown> = {
    id: spec.id,
    category: spec.category,
    language: spec.language,
    title: spec.title,
    caption: spec.caption,
    alt: spec.alt,
    showcaseSection: spec.showcaseSection,
    safeForPublic: spec.safeForPublic,
    src: `assets/screenshots/${spec.id}.webp`,
    src2x: `assets/screenshots/${spec.id}@2x.webp`,
    fallback: `assets/screenshots/${spec.id}.png`,
    fallback2x: `assets/screenshots/${spec.id}@2x.png`,
    width: MOBILE_WIDTH,
    width2x: RETINA_WIDTH,
  };
  if (spec.privacyNote) entry.privacyNote = spec.privacyNote;
  if (!hasWebp) {
    entry.src = entry.fallback;
    entry.src2x = entry.fallback2x;
  }
  console.log(`ok ${spec.id}`);
  return entry;
}

function main(): void {
  if (!hasSips()) {
    console.error("macOS `sips` is required for HEIC conversion.");
    console.error("Manual: sips -s format png assets/IMG_xxxx.HEIC --out public-site/assets/screenshots/id.png");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest: Record<string, unknown>[] = [];
  for (const spec of SPECS) {
    const entry = convertOne(spec);
    if (entry) manifest.push(entry);
  }

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    DATA_JS_PATH,
    `/** AUTO-GENERATED — npm run prepare:public-screenshots */\nwindow.__SCREENSHOT_MANIFEST__ = ${JSON.stringify(manifest, null, 2)};\n`,
    "utf8"
  );
  console.log(`\nWrote ${manifest.length} entries → ${MANIFEST_PATH}`);
  console.log(`Wrote embedded manifest → ${DATA_JS_PATH}`);
}

main();
