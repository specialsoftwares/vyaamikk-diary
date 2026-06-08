#!/usr/bin/env npx tsx
/**
 * DEV-ONLY reset CLI. Never run against production.
 *
 * Local device storage (SQLite, AsyncStorage, SecureStore) lives on the device/simulator
 * and must be cleared via the in-app Developer screen OR this script's firebase commands.
 */

import {
  DEV_RESET_CONFIRM_PHRASE,
  assertDevResetAllowedForCli,
  assertFirebaseDevResetAllowed,
} from "../src/services/devReset/guards";

function readArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function backendLabel(): string {
  const mode = process.env.EXPO_PUBLIC_APP_MODE ?? "development";
  const hasFb = Boolean(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim());
  if (mode === "production") return hasFb ? "firebase-production" : "not-configured";
  return hasFb ? "firebase-shared-dev" : "local-mock";
}

async function runFirebaseReset(all: boolean, target: { phone?: string; email?: string; ueid?: string }) {
  const confirm = readArg("--confirm") ?? readArg("-c");
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  assertFirebaseDevResetAllowed(confirm, projectId);

  const { initializeApp, getApps } = await import("firebase/app");
  const { getFirestore } = await import("firebase/firestore");

  if (getApps().length === 0) {
    initializeApp({
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    });
  }

  getFirestore();

  const {
    resetAllFirebaseDevData,
    resetFirebaseDevDataForTarget,
  } = await import("../src/services/devReset/firebaseDevReset");

  if (all) {
    const result = await resetAllFirebaseDevData(confirm!);
    console.log(JSON.stringify(result, null, 2));
    if (result.warnings.length) {
      console.warn("\nWarnings (indexes may need Admin SDK in strict rules):");
      result.warnings.forEach((w) => console.warn(" •", w));
    }
    return;
  }

  const result = await resetFirebaseDevDataForTarget(confirm!, target);
  console.log(JSON.stringify(result, null, 2));
  if (result.warnings.length) {
    result.warnings.forEach((w) => console.warn(" •", w));
  }
}

function printLocalInstructions(scope: "all" | "targeted", target?: string) {
  console.log(`
Vyaamikk Diary — local dev reset (on-device)

Safety checks passed.
Backend: ${backendLabel()}
Project: ${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "(none)"}

Local SQLite, AsyncStorage, SecureStore, and files live ON THE DEVICE.
Clear them from the running development app:

  1. Open the app (simulator or device, __DEV__ build)
  2. Settings tab → Developer tools → Reset local dev data
  3. Enter confirmation phrase exactly:
     ${DEV_RESET_CONFIRM_PHRASE}
  4. Tap reset — app signs out and returns to login

Scope requested: ${scope}${target ? ` (${target})` : ""}

After reset, verify:
  • Login with a test mobile number behaves like a fresh account
  • No old drafts, PDF history, or suggestions appear
  • PDFs already exported/shared outside the app are NOT recalled

Firebase/shared-dev data: run  npm run dev:reset-firebase  (with --confirm)
Targeted Firebase user:       npm run dev:reset-user -- --phone 9876543210 --confirm "${DEV_RESET_CONFIRM_PHRASE}"
`);
}

async function main(): Promise<void> {
  const sub = process.argv[2] ?? "help";
  const confirm = readArg("--confirm") ?? readArg("-c");

  if (sub === "help" || hasFlag("--help") || hasFlag("-h")) {
    console.log(`
Usage:
  npm run dev:reset-local   [--confirm "${DEV_RESET_CONFIRM_PHRASE}"]
  npm run dev:reset-firebase [--confirm "${DEV_RESET_CONFIRM_PHRASE}"]
  npm run dev:reset-user -- --phone 9876543210 [--email a@b.com] [--ueid VYD-2026-XXXXXX] --confirm "${DEV_RESET_CONFIRM_PHRASE}"

Notes:
  • Local device storage is cleared in-app (Settings → Developer tools).
  • Firebase commands run from this CLI when shared-dev is configured.
  • Refused when EXPO_PUBLIC_APP_MODE=production or project looks like production.
`);
    process.exit(0);
  }

  if (sub === "local") {
    assertDevResetAllowedForCli(confirm);
    const phone = readArg("--phone");
    const email = readArg("--email");
    const ueid = readArg("--ueid");
    if (phone || email || ueid) {
      printLocalInstructions("targeted", phone ?? email ?? ueid);
    } else {
      printLocalInstructions("all");
    }
    return;
  }

  if (sub === "firebase") {
    await runFirebaseReset(true, {});
    return;
  }

  if (sub === "user") {
    const phone = readArg("--phone");
    const email = readArg("--email");
    const ueid = readArg("--ueid");
    assertDevResetAllowedForCli(confirm);
    printLocalInstructions("targeted", phone ?? email ?? ueid);
    if (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) {
      console.log("\nRunning Firebase targeted cleanup…");
      await runFirebaseReset(false, { phone, email, ueid });
    }
    return;
  }

  console.error(`Unknown subcommand: ${sub}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
