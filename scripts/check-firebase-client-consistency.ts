#!/usr/bin/env npx tsx
/**
 * Pre-build consistency check: native google-services.json vs JS EXPO_PUBLIC_* Firebase config.
 * Prints only pass/fail booleans and field names — never secret values.
 *
 * Usage:
 *   npx --yes tsx scripts/check-firebase-client-consistency.ts
 *   EXPO_PUBLIC_* may come from process.env / .env (Expo load) or EAS env pull.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function env(key: string, fileEnv: Record<string, string>): string {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.length > 0) return fromProcess;
  return fileEnv[key] ?? "";
}

function main(): void {
  const root = process.cwd();
  const fileEnv = {
    ...readEnvFile(path.join(root, ".env")),
    ...readEnvFile(path.join(root, ".env.local")),
  };

  const gsPath = path.join(root, "google-services.json");
  assert.ok(fs.existsSync(gsPath), "google-services.json missing at repo root (required for Android RNFirebase)");

  const gs = JSON.parse(fs.readFileSync(gsPath, "utf8")) as {
    project_info?: { project_id?: string; project_number?: string; storage_bucket?: string };
    client?: Array<{
      client_info?: {
        mobilesdk_app_id?: string;
        android_client_info?: { package_name?: string };
      };
      oauth_client?: unknown[];
    }>;
  };

  const projectId = gs.project_info?.project_id ?? "";
  const senderId = String(gs.project_info?.project_number ?? "");
  const bucket = gs.project_info?.storage_bucket ?? "";
  const client = gs.client?.[0];
  const androidPackage = client?.client_info?.android_client_info?.package_name ?? "";
  const androidAppId = client?.client_info?.mobilesdk_app_id ?? "";
  const oauthCount = client?.oauth_client?.length ?? 0;

  const jsProjectId = env("EXPO_PUBLIC_FIREBASE_PROJECT_ID", fileEnv);
  const jsSender = env("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", fileEnv);
  const jsBucket = env("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", fileEnv);
  const jsApiKey = env("EXPO_PUBLIC_FIREBASE_API_KEY", fileEnv);
  const jsAuthDomain = env("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", fileEnv);
  const jsAppId = env("EXPO_PUBLIC_FIREBASE_APP_ID", fileEnv);
  const jsRegion = env("EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION", fileEnv) || "asia-south1";

  const requiredJs = {
    EXPO_PUBLIC_FIREBASE_API_KEY: jsApiKey,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: jsAuthDomain,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: jsProjectId,
    EXPO_PUBLIC_FIREBASE_APP_ID: jsAppId,
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: jsSender,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: jsBucket,
  };

  const missing = Object.entries(requiredJs)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (missing.length) {
    errors.push(`Missing JS Firebase env keys: ${missing.join(", ")}`);
  }
  if (projectId !== "vyaamikk-diary") {
    errors.push(`Native google-services project_id is not vyaamikk-diary`);
  }
  if (jsProjectId && jsProjectId !== projectId) {
    errors.push("EXPO_PUBLIC_FIREBASE_PROJECT_ID does not match google-services project_id");
  }
  if (jsSender && jsSender !== senderId) {
    errors.push("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID does not match google-services project_number");
  }
  if (jsBucket && bucket && jsBucket !== bucket) {
    errors.push("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET does not match google-services storage_bucket");
  }
  if (androidPackage !== "com.specialsoftwares.vyaamikkdiary") {
    errors.push("google-services Android package_name mismatch");
  }
  if (androidAppId && !androidAppId.includes(":android:")) {
    errors.push("google-services mobilesdk_app_id does not look like an Android app id");
  }
  if (jsAppId && androidAppId && jsAppId === androidAppId) {
    warnings.push(
      "JS EXPO_PUBLIC_FIREBASE_APP_ID equals Android mobilesdk_app_id — usually the Web app id is used for the JS SDK; verify Console registrations"
    );
  }
  if (jsAppId && androidAppId && jsAppId !== androidAppId) {
    // Expected when Web + Android apps coexist in the same project.
    warnings.push("JS app id differs from Android app id (expected for Web SDK + Android native apps in one project)");
  }
  if (jsRegion !== "asia-south1") {
    warnings.push(`Functions region is "${jsRegion}" (canonical deploy region is asia-south1)`);
  }
  if (oauthCount === 0) {
    warnings.push(
      "google-services.json has zero oauth_client entries — SHA-1/SHA-256 for the EAS signing keystore may be missing in Firebase Console (Phone Auth risk)"
    );
  }

  const forbidden = [
    "EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP",
    "EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP",
    "EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE",
  ];
  for (const key of forbidden) {
    const v = env(key, fileEnv);
    if (v && v !== "0" && v.toLowerCase() !== "false") {
      errors.push(`${key} must not be set for preview/production standalone builds`);
    }
  }
  if (env("EXPO_PUBLIC_DEV_BACKEND", fileEnv) === "shared-dev") {
    errors.push("EXPO_PUBLIC_DEV_BACKEND=shared-dev is forbidden for standalone beta");
  }

  console.log(
    JSON.stringify(
      {
        ok: errors.length === 0,
        nativeProjectIdSet: Boolean(projectId),
        androidPackageOk: androidPackage === "com.specialsoftwares.vyaamikkdiary",
        jsKeysPresent: missing.length === 0,
        projectIdAligned: Boolean(jsProjectId) && jsProjectId === projectId,
        messagingSenderAligned: Boolean(jsSender) && jsSender === senderId,
        storageBucketAligned: Boolean(jsBucket) && jsBucket === bucket,
        functionsRegion: jsRegion,
        oauthClientCount: oauthCount,
        warnings,
        errors,
      },
      null,
      2
    )
  );

  if (errors.length) {
    process.exitCode = 1;
  }
}

main();
