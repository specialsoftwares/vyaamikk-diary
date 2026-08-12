/**
 * Regression for live 2026-08-07 resolveOrCreateUserByPhone INTERNAL:
 * FirebaseAppError app/no-app from getAdminDb / getFirestore.
 *
 * Proves getAdminDb recovers by ensuring a default app exists.
 */
import assert from "node:assert/strict";
import { getApps, deleteApp } from "firebase-admin/app";

async function clearApps(): Promise<void> {
  const apps = [...getApps()];
  for (const app of apps) {
    await deleteApp(app);
  }
}

async function main(): Promise<void> {
  await clearApps();
  assert.equal(getApps().length, 0);

  // Fresh import after clear — module may already be cached; call getters directly.
  // Re-require compiled path is awkward under tsx; instead exercise ensure via getters
  // by dynamic import of source after clearing.
  const admin = await import("./admin");
  // Module-load init may have run before clear; call getAdminDb which re-inits.
  await clearApps();
  assert.equal(getApps().length, 0);

  const db = admin.getAdminDb();
  assert.ok(db);
  assert.equal(getApps().length >= 1, true);

  // Second call must be stable.
  const db2 = admin.getAdminDb();
  assert.ok(db2);

  const auth = admin.getAdminAuth();
  assert.ok(auth);

  console.log("admin.noAppRecovery.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
