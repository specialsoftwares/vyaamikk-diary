import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { updateProfileWithIo, type ProfileUpdateIo } from "./firebase";
import { retireJsAuthBridge } from "./authSessionFence";
import { AppError } from "../../domain/errors";
import { advanceProfileSessionEpoch, readPlatformProfileUid, captureProfileWriteOwnership, confirmFailureForOwnedEpoch, publishOwnedProfileSession } from "./profileWriteOwnership";

async function run() {
  for (const replace of [retireJsAuthBridge, advanceProfileSessionEpoch]) {
    let writes = 0;
    const io: ProfileUpdateIo = {
      production: true,
      readAuthUid: () => "fixture-owner",
      requireJsAuthSession: async () => undefined,
      getUserDoc: async () => {
        replace();
        return { exists: true, data: { uid: "fixture-owner", phoneE164: "+919999999999", createdAt: 1, updatedAt: 1, legalConsents: [] } };
      },
      mergeUserDoc: async () => { writes++; },
      openBusinessCloud: async (_collection, record) => record,
      protectBusinessCloud: async input => input.plain,
    };
    await assert.rejects(updateProfileWithIo("fixture-owner", { legalConsents: [] }, io), /session_changed/);
    assert.equal(writes, 0, "same UID replacement must not issue a write");
  }
  for (const stage of ["bridge", "read", "open", "seal"] as const) {
    for (const change of ["signout", "account", "same-uid", "operation-retired"] as const) {
      let uid: string | null = "fixture-owner";
      let operationCurrent = true;
      let writes = 0;
      const mutate = () => {
        if (change === "operation-retired") operationCurrent = false;
        else if (change === "same-uid") advanceProfileSessionEpoch();
        else uid = change === "signout" ? null : "replacement-owner";
      };
      const io: ProfileUpdateIo = {
        production: true, readAuthUid: () => uid,
        ownership: { ...captureProfileWriteOwnership("fixture-owner"), isCurrent: () => operationCurrent },
        requireJsAuthSession: async () => { if (stage === "bridge") mutate(); },
        getUserDoc: async () => {
          if (stage === "read") mutate();
          return { exists: true, data: { uid: "fixture-owner", phoneE164: "+919999999999", createdAt: 1, updatedAt: 1 } };
        },
        mergeUserDoc: async () => { writes++; },
        openBusinessCloud: async (_collection, record) => { if (stage === "open") mutate(); return record; },
        protectBusinessCloud: async input => { if (stage === "seal") mutate(); return input.plain; },
      };
      await assert.rejects(updateProfileWithIo("fixture-owner", { displayName: "Fixture" }, io), /session_changed/);
      assert.equal(writes, 0, `${change} during ${stage} must not issue a profile write`);
    }
  }
  for (const stage of ["bridge", "local-key", "persist"] as const) {
    let published = 0;
    let saved = 0;
    const owner = captureProfileWriteOwnership("fixture-owner");
    await assert.rejects(publishOwnedProfileSession({
      profileUid: "fixture-owner", owner, liveUid: () => "fixture-owner",
      prepare: async () => { if (stage === "bridge") advanceProfileSessionEpoch(); },
      save: async (isCurrent) => {
        if (stage === "local-key") advanceProfileSessionEpoch();
        if (!isCurrent()) throw Error("session_changed");
        saved++;
        if (stage === "persist") advanceProfileSessionEpoch();
        return { uid: "fixture-owner" };
      },
      publish: () => { published++; },
    }), /session_changed/);
    assert.equal(published, 0, `replacement during ${stage} must not publish`);
    assert.equal(saved, stage === "persist" ? 1 : 0);
  }
  let published = 0;
  await publishOwnedProfileSession({
    profileUid: "fixture-owner", owner: captureProfileWriteOwnership("fixture-owner"),
    liveUid: () => "fixture-owner", prepare: async () => undefined,
    save: async isCurrent => { assert.equal(isCurrent(), true); return "session"; },
    publish: session => { assert.equal(session, "session"); published++; },
  });
  assert.equal(published, 1);
  assert.equal(readPlatformProfileUid({ platform: () => "android", nativeUid: () => null, jsUid: () => "stale-js" }), null);
  assert.equal(readPlatformProfileUid({ platform: () => "web", nativeUid: () => "unused", jsUid: () => "web-owner" }), "web-owner");
  assert.equal(readPlatformProfileUid({ platform: () => { throw Error("unavailable"); }, nativeUid: () => "unused", jsUid: () => "stale-js" }), null);
  const pending = new AppError("account_pending_deletion", "Account deletion is in progress.");
  const replaced = confirmFailureForOwnedEpoch({ ownedEpoch: 4, currentEpoch: 5, error: pending });
  assert.equal(replaced instanceof AppError && replaced.message, "session_changed");
  assert.equal(confirmFailureForOwnedEpoch({ ownedEpoch: 4, currentEpoch: 4, error: pending }), pending);
  const confirm = readFileSync(resolve(process.cwd(), "src/state/auth.tsx"), "utf8");
  const confirmStart = confirm.indexOf("const confirmOtp = useCallback");
  const confirmBody = confirm.slice(confirmStart, confirm.indexOf("const signOut = useCallback", confirmStart));
  assert.match(confirmBody, /confirmFailureForOwnedEpoch\(/);
  console.log("profileWriteOwnership.regression.test.ts: ok");
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
