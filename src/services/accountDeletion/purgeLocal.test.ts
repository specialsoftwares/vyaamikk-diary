/**
 * Owner-scoped AsyncStorage deletion. Account A’s demographic band is removed.
 * Account B and unrelated keys stay. An in-flight band write cannot recreate
 * A’s key after the purge. Ordinary sign-out does not delete the band.
 */

import assert from "node:assert/strict";

import {
  demographicAgePurgeEpoch,
  demographicAgeStorageKey,
  writeDeviceDemographicAge,
} from "@/onboarding/demographicAge";
import { retainLocalAccountOnLogout } from "@/services/accountDeletion/localAccountBoundary";
import { removeAsyncStorageKeysForUser } from "@/services/accountDeletion/ownerAsyncStorage";

const OWNER_A = "uid-owner-a";
const OWNER_B = "uid-owner-b";

const OWNER_KEY_PREFIXES = [
  "vyd_diary_v2_",
  "vyd_diary_v1_",
  "vyd_pro_pack_v1_",
  "vyd_letterhead_v1_",
  "vyd_letterhead_docs_v1_",
  "vyd_po_v1_",
  "vyd_po_serial_v1_",
  "vyd_credit_v1_",
  "vyd_credit_serial_v1_",
];

function createStore() {
  const data = new Map<string, string>();
  let hangNext = false;
  let releaseHang: (() => void) | undefined;
  return {
    data,
    armHang() {
      hangNext = true;
    },
    release() {
      const releaseWrite = releaseHang;
      releaseHang = undefined;
      if (!releaseWrite) throw new Error("no hung demographic write");
      releaseWrite();
    },
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      if (hangNext) {
        hangNext = false;
        await new Promise<void>((resolve) => {
          releaseHang = () => {
            data.set(key, value);
            resolve();
          };
        });
        return;
      }
      data.set(key, value);
    },
    async removeItem(key: string) {
      data.delete(key);
    },
    async getAllKeys() {
      return [...data.keys()];
    },
    async multiRemove(keys: string[]) {
      for (const key of keys) data.delete(key);
    },
  };
}

function seedOwnerInventory(store: ReturnType<typeof createStore>, uid: string, band: string) {
  for (const prefix of OWNER_KEY_PREFIXES) {
    store.data.set(`${prefix}${uid}`, "row");
  }
  store.data.set(`vyd_pro_pack_draft_${uid}_1`, "draft");
  store.data.set(demographicAgeStorageKey(uid), band);
}

async function main(): Promise<void> {
  const store = createStore();
  await writeDeviceDemographicAge(OWNER_A, "skipped", store);
  await writeDeviceDemographicAge(OWNER_B, "55_plus", store);
  store.data.set("vyd_lang_v1", "en");
  store.data.set("vyd_session_v2", "session");

  const epochBeforeSignOut = demographicAgePurgeEpoch(OWNER_A);
  assert.equal(retainLocalAccountOnLogout(OWNER_A), "retained");
  assert.equal(demographicAgePurgeEpoch(OWNER_A), epochBeforeSignOut);
  assert.equal(store.data.get(demographicAgeStorageKey(OWNER_A)), "skipped");
  assert.equal(store.data.get(demographicAgeStorageKey(OWNER_B)), "55_plus");
  assert.equal(store.data.get("vyd_lang_v1"), "en");
  assert.equal(store.data.get("vyd_session_v2"), "session");

  seedOwnerInventory(store, OWNER_A, "skipped");
  seedOwnerInventory(store, OWNER_B, "55_plus");
  store.data.set("vyd_demographic_age_band_v1:uid-owner-a-extra", "keep");
  store.data.set("vyd_pro_pack_draft_uid-owner-ax", "keep");
  store.data.set("notes-uid-owner-a", "keep");

  const before = await store.getAllKeys();
  await removeAsyncStorageKeysForUser(OWNER_A, store);
  const after = await store.getAllKeys();
  const removed = before.filter((key) => !after.includes(key));
  assert.ok(removed.includes(demographicAgeStorageKey(OWNER_A)));
  assert.ok(removed.includes("vyd_diary_v2_uid-owner-a"));
  assert.ok(removed.includes("vyd_pro_pack_draft_uid-owner-a_1"));
  for (const key of removed) {
    assert.equal(key.includes(OWNER_A), true, key);
    assert.equal(key.includes(OWNER_B), false, key);
  }
  assert.ok(after.includes(demographicAgeStorageKey(OWNER_B)));
  assert.equal(store.data.get(demographicAgeStorageKey(OWNER_B)), "55_plus");
  assert.equal(store.data.get("vyd_diary_v2_uid-owner-b"), "row");
  assert.equal(store.data.get("vyd_pro_pack_draft_uid-owner-b_1"), "draft");
  assert.equal(store.data.get("vyd_lang_v1"), "en");
  assert.equal(store.data.get("vyd_session_v2"), "session");
  assert.equal(store.data.get("vyd_demographic_age_band_v1:uid-owner-a-extra"), "keep");
  assert.equal(store.data.get("vyd_pro_pack_draft_uid-owner-ax"), "keep");
  assert.equal(store.data.get("notes-uid-owner-a"), "keep");
  assert.equal(store.data.has(demographicAgeStorageKey(OWNER_A)), false);

  await writeDeviceDemographicAge(OWNER_A, "18_24", store);
  assert.equal(store.data.get(demographicAgeStorageKey(OWNER_A)), "18_24");
  store.armHang();
  const inflight = writeDeviceDemographicAge(OWNER_A, "prefer_not_to_say", store);
  assert.equal(store.data.get(demographicAgeStorageKey(OWNER_A)), "18_24");
  await removeAsyncStorageKeysForUser(OWNER_A, store);
  assert.equal(store.data.has(demographicAgeStorageKey(OWNER_A)), false);
  assert.equal(store.data.get(demographicAgeStorageKey(OWNER_B)), "55_plus");
  store.release();
  await inflight;
  assert.equal(store.data.has(demographicAgeStorageKey(OWNER_A)), false);
  assert.equal(store.data.get(demographicAgeStorageKey(OWNER_B)), "55_plus");
  assert.equal(store.data.get("vyd_lang_v1"), "en");
  assert.equal(store.data.get("notes-uid-owner-a"), "keep");
  assert.equal(await store.getItem(demographicAgeStorageKey(OWNER_A)), null);

  console.log("purgeLocal.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
