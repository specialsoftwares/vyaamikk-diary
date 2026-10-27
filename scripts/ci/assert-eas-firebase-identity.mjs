/**
 * EAS build check for the secret Firebase Android file.
 * Prints the project id and package name. Never prints the file or an API key.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_FIREBASE_PROJECT = "vyaamikk-diary";
export const EXPECTED_ANDROID_PACKAGE = "com.specialsoftwares.vyaamikkdiary";

const PRODUCTION_PROFILES = new Set(["production", "internal-grin", "internal-grin-apk"]);

export function evaluateFirebaseIdentity(parsed) {
  const projectId =
    parsed && parsed.project_info && typeof parsed.project_info.project_id === "string"
      ? parsed.project_info.project_id
      : "";
  const packages = [];
  const clients = parsed && Array.isArray(parsed.client) ? parsed.client : [];
  for (const client of clients) {
    const name = client?.client_info?.android_client_info?.package_name;
    if (typeof name === "string" && name) packages.push(name);
  }
  const packageName = packages.length === 1 ? packages[0] : "";
  return {
    ok: projectId === EXPECTED_FIREBASE_PROJECT && packageName === EXPECTED_ANDROID_PACKAGE,
    projectId,
    packageName,
  };
}

export function identityLine(result) {
  return `firebase_project=${result.projectId || "missing"} android_package=${result.packageName || "missing"}`;
}

function readInjected(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("firebase_identity_missing");
  let text = raw;
  if (fs.existsSync(raw) && fs.statSync(raw).isFile()) {
    text = fs.readFileSync(raw, "utf8");
  } else if (!raw.startsWith("{")) {
    text = Buffer.from(raw, "base64").toString("utf8");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("firebase_identity_unreadable");
  }
}

function main() {
  if (!process.env.EAS_BUILD) return;
  const profile = process.env.EAS_BUILD_PROFILE ?? "";
  if (!PRODUCTION_PROFILES.has(profile)) return;
  let result;
  try {
    result = evaluateFirebaseIdentity(readInjected(process.env.GOOGLE_SERVICES_JSON));
  } catch (error) {
    const code = error instanceof Error ? error.message : "firebase_identity_unreadable";
    console.log(`firebase_project=missing android_package=missing`);
    console.error(code === "firebase_identity_missing" ? code : "firebase_identity_unreadable");
    process.exit(1);
  }
  console.log(identityLine(result));
  if (!result.ok) process.exit(1);
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entry && import.meta.url === entry) main();
