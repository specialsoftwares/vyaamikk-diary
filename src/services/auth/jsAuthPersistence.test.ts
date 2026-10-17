/**
 * SOURCE — JS credential persistence decision.
 * SecureStore profile cache is not the Firebase JS credential store.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { JS_AUTH_CREDENTIAL_PERSISTENCE } from "@/config/firebase";
import { shouldForceIdTokenRefresh } from "./idTokenRefresh";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok - ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function main() {
  console.log("js auth persistence (SOURCE)");
  const firebase = source("src/config/firebase.ts");
  const session = source("src/services/session.ts");
  const signOut = source("src/state/auth.tsx") + source("src/services/auth/firebase.ts");
  const authPackage = JSON.parse(source("node_modules/@firebase/auth/package.json")) as {
    version?: string;
  };
  const rnPersistence = source("node_modules/@firebase/auth/dist/rn/index.js");

  check(
    "keeps AsyncStorage JS persistence",
    JS_AUTH_CREDENTIAL_PERSISTENCE === "async-storage" &&
      firebase.includes("getReactNativePersistence")
  );
  check(
    "installed SDK persistence is async JSON storage",
    authPackage.version === "1.13.2" &&
      rnPersistence.includes("async _get(key)") &&
      rnPersistence.includes("JSON.stringify(value)") &&
      rnPersistence.includes("await storage.getItem(key)") &&
      rnPersistence.includes("Listeners are not supported")
  );
  check(
    "rationale records the AsyncStorage credential risk and no migration",
    firebase.includes("plaintext") &&
      firebase.includes("does not migrate the credential store") &&
      !firebase.includes("reads synchronously")
  );
  check("profile cache key is not a credential store", session.includes('const KEY = "vyd_session_v2"'));
  check(
    "profile cache does not store raw tokens",
    !session.includes("idToken") && !session.includes("refreshToken")
  );
  check(
    "sign-out does not clear all AsyncStorage",
    !signOut.includes("AsyncStorage.clear(")
  );
  check(
    "profile clear removes only the session keys",
    session.includes("removeItem(KEY)") && session.includes("removeItem(LEGACY_KEY)")
  );
  check(
    "cached token reads are not forced",
    shouldForceIdTokenRefresh({ explicitInvalidation: false, recoveryAttempt: 0 }) === false &&
      shouldForceIdTokenRefresh({ explicitInvalidation: true, recoveryAttempt: 0 })
  );

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all js auth persistence tests passed");
}

main();
