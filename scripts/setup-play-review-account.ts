/**
 * Offline-safe source for a later Play review account preflight.
 * Does not create an Auth user. Does not mutate Firebase during source assembly.
 *
 * Usage (live, owner-authorized, not this assignment):
 *   npm run review:verify-account
 *   npm run review:verify-account -- --uid <firebase-uid>
 *
 * This script checks only: name, businessName, phoneE164, ueid, status===active
 * on users/{uid}. It does not verify email, location, onboarding screens,
 * or Play Console access.
 */
import { createRequire } from "node:module";
import path from "node:path";

const REVIEW_PHONE = "+919000000000";
const ACTION =
  "→ Action required: Sign in with +91 9000000000 / OTP 654321 on a production build and complete onboarding";

const requireFromFunctions = createRequire(
  path.resolve("functions/package.json")
);

type AdminAuth = {
  getUserByPhoneNumber(phone: string): Promise<{ uid: string }>;
};

type UserSnap = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type AdminFirestore = {
  collection(name: string): {
    doc(id: string): { get(): Promise<UserSnap> };
  };
};

type FirebaseAdmin = {
  initializeApp: () => void;
  auth: () => AdminAuth;
  firestore: () => AdminFirestore;
};

type FirebaseAdminApp = {
  getApps: () => unknown[];
};

function fail(message: string): never {
  console.error(message);
  console.error(ACTION);
  process.exit(1);
}

function readUidArg(): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--uid") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        fail("--uid requires a Firebase UID.");
      }
      return value;
    }
    if (arg.startsWith("--uid=")) {
      const value = arg.slice("--uid=".length).trim();
      if (!value) fail("--uid requires a Firebase UID.");
      return value;
    }
  }
  return undefined;
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function main(): Promise<void> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    console.error(
      "GOOGLE_APPLICATION_CREDENTIALS is missing. Point it at a Firebase service account JSON file, then run this script again."
    );
    process.exit(1);
  }

  const admin = requireFromFunctions("firebase-admin") as FirebaseAdmin;
  const { getApps } = requireFromFunctions("firebase-admin/app") as FirebaseAdminApp;
  if (getApps().length === 0) {
    admin.initializeApp();
  }

  let uid = readUidArg();
  if (!uid) {
    try {
      const user = await admin.auth().getUserByPhoneNumber(REVIEW_PHONE);
      uid = user.uid;
      console.log(`Looked up UID by ${REVIEW_PHONE}: ${uid}`);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code === "auth/user-not-found") {
        fail(`No Firebase Auth user for ${REVIEW_PHONE}.`);
      }
      const message = error instanceof Error ? error.message : "lookup failed";
      fail(`Could not look up ${REVIEW_PHONE}: ${message}`);
    }
  }

  const snap = await admin.firestore().collection("users").doc(uid).get();
  if (!snap.exists) {
    fail(`users/${uid} does not exist.`);
  }
  const data = snap.data() ?? {};

  const fields: { label: string; key: string; value: string | null }[] = [
    { label: "Name", key: "name", value: nonEmpty(data.name) },
    { label: "Business", key: "businessName", value: nonEmpty(data.businessName) },
    { label: "Phone", key: "phoneE164", value: nonEmpty(data.phoneE164) },
    { label: "UEID", key: "ueid", value: nonEmpty(data.ueid) },
    { label: "Status", key: "status", value: nonEmpty(data.status) },
  ];

  const missing = fields.filter((field) => !field.value);
  if (missing.length > 0) {
    for (const field of missing) {
      console.error(`❌ INCOMPLETE: ${field.key} is missing`);
    }
    console.error(ACTION);
    process.exit(1);
  }

  const status = fields.find((field) => field.key === "status")?.value;
  if (status !== "active") {
    console.error(`❌ INCOMPLETE: status is ${status}`);
    console.error(ACTION);
    process.exit(1);
  }

  console.log(`✅ Test account UID: ${uid}`);
  for (const field of fields) {
    console.log(`✅ ${field.label}: ${field.value}`);
  }
  console.log(
    "✅ Checked users/{uid} fields only: name, businessName, phoneE164, ueid, status=active"
  );
  console.log(
    "This script does not verify email, location, onboarding screens, or Play Console sign-in."
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "review account check failed";
  console.error(message);
  process.exit(1);
});
