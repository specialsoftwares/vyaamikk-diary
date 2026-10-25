import { sealOwnedPayload } from "@/services/accountDeletion/localPayload";

export const MOCK_DIARY_V2_PREFIX = "vyd_diary_v2_";
export const MOCK_DIARY_V1_PREFIX = "vyd_diary_v1_";

type DiaryKeyStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function mockDiaryPayloadState(raw: string | null): "empty" | "sealed" | "json" {
  if (!raw) return "empty";
  if (raw.startsWith("vyd1:")) return "sealed";
  return "json";
}

/**
 * Seals a leftover mock-diary blob for one account. Does not delete it.
 * The firebase production repository does not read this key.
 */
export async function sealRetainedMockDiary(
  storage: DiaryKeyStorage,
  uid: string
): Promise<"absent" | "sealed" | "already_sealed"> {
  let saw = false;
  let sealed = false;
  for (const prefix of [MOCK_DIARY_V2_PREFIX, MOCK_DIARY_V1_PREFIX]) {
    const key = `${prefix}${uid}`;
    const raw = await storage.getItem(key);
    if (!raw) continue;
    saw = true;
    if (mockDiaryPayloadState(raw) === "sealed") continue;
    await storage.setItem(key, sealOwnedPayload(uid, raw));
    sealed = true;
  }
  if (!saw) return "absent";
  return sealed ? "sealed" : "already_sealed";
}
