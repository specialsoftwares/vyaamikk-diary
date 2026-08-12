/**
 * Local pending state for Auth-updated-but-not-yet-server-bound mobile change.
 * Never treated as identity. Used only to complete bind after interruption.
 */

import type { PhoneE164 } from "@/domain/types";
import { normalizePhoneE164 } from "@/utils/mobileHash";

const KEY = "vyd_pending_mobile_contact_change_v1";

export type PendingMobileContactChange = {
  uid: string;
  oldPhoneE164: PhoneE164;
  newPhoneE164: PhoneE164;
  operationId: string;
  /** Epoch ms when Firebase Auth phone was updated to newPhoneE164. */
  authUpdatedAt: number;
  purpose: "contact_change";
};

type Kv = {
  setItemAsync?: (k: string, v: string) => Promise<void>;
  getItemAsync?: (k: string) => Promise<string | null>;
  deleteItemAsync?: (k: string) => Promise<void>;
  setItem?: (k: string, v: string) => Promise<void>;
  getItem?: (k: string) => Promise<string | null>;
  removeItem?: (k: string) => Promise<void>;
};

const memory = new Map<string, string>();

function getStore(): { kind: "secure" | "async" | "memory"; api: Kv } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    if (Platform.OS === "web" || Platform.OS === "node") {
      return {
        kind: "memory",
        api: {
          setItem: async (k, v) => {
            memory.set(k, v);
          },
          getItem: async (k) => memory.get(k) ?? null,
          removeItem: async (k) => {
            memory.delete(k);
          },
        },
      };
    }
    if (Platform.OS === "ios" || Platform.OS === "android") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SecureStore = require("expo-secure-store") as Kv;
      return { kind: "secure", api: SecureStore };
    }
  } catch {
    /* node tests */
  }
  return {
    kind: "memory",
    api: {
      setItem: async (k, v) => {
        memory.set(k, v);
      },
      getItem: async (k) => memory.get(k) ?? null,
      removeItem: async (k) => {
        memory.delete(k);
      },
    },
  };
}

async function setRaw(value: string): Promise<void> {
  const { kind, api } = getStore();
  if (kind === "secure" && api.setItemAsync) await api.setItemAsync(KEY, value);
  else if (api.setItem) await api.setItem(KEY, value);
}

async function getRaw(): Promise<string | null> {
  const { kind, api } = getStore();
  if (kind === "secure" && api.getItemAsync) return api.getItemAsync(KEY);
  if (api.getItem) return api.getItem(KEY);
  return null;
}

async function delRaw(): Promise<void> {
  const { kind, api } = getStore();
  if (kind === "secure" && api.deleteItemAsync) await api.deleteItemAsync(KEY);
  else if (api.removeItem) await api.removeItem(KEY);
}

export async function savePendingMobileContactChange(
  pending: PendingMobileContactChange
): Promise<void> {
  await setRaw(
    JSON.stringify({
      ...pending,
      oldPhoneE164: normalizePhoneE164(pending.oldPhoneE164),
      newPhoneE164: normalizePhoneE164(pending.newPhoneE164),
      purpose: "contact_change",
    })
  );
}

export async function loadPendingMobileContactChange(): Promise<PendingMobileContactChange | null> {
  const raw = await getRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingMobileContactChange>;
    if (
      typeof parsed.uid !== "string" ||
      typeof parsed.oldPhoneE164 !== "string" ||
      typeof parsed.newPhoneE164 !== "string" ||
      typeof parsed.operationId !== "string" ||
      typeof parsed.authUpdatedAt !== "number" ||
      parsed.purpose !== "contact_change"
    ) {
      await delRaw();
      return null;
    }
    return {
      uid: parsed.uid,
      oldPhoneE164: normalizePhoneE164(parsed.oldPhoneE164),
      newPhoneE164: normalizePhoneE164(parsed.newPhoneE164),
      operationId: parsed.operationId,
      authUpdatedAt: parsed.authUpdatedAt,
      purpose: "contact_change",
    };
  } catch {
    await delRaw();
    return null;
  }
}

export async function clearPendingMobileContactChange(): Promise<void> {
  await delRaw();
}

/**
 * Pure decision: should boot/client retry server bind?
 * Never leaks pending into issuer identity — only drives recovery.
 */
export function shouldRetryServerMobileBind(args: {
  uid: string;
  authPhoneE164: string | null;
  profilePhoneE164: string;
  pending: PendingMobileContactChange | null;
}): { retry: false } | { retry: true; newerPhoneE164: PhoneE164; operationId: string } {
  const profile = normalizePhoneE164(args.profilePhoneE164);
  const auth = args.authPhoneE164 ? normalizePhoneE164(args.authPhoneE164) : null;

  if (auth && auth === profile) {
    return { retry: false };
  }

  if (
    args.pending &&
    args.pending.uid === args.uid &&
    auth &&
    auth === normalizePhoneE164(args.pending.newPhoneE164) &&
    profile === normalizePhoneE164(args.pending.oldPhoneE164)
  ) {
    return {
      retry: true,
      newerPhoneE164: args.pending.newPhoneE164,
      operationId: args.pending.operationId,
    };
  }

  // Auth already B, profile still A, even without local pending — complete bind.
  if (auth && auth !== profile) {
    return {
      retry: true,
      newerPhoneE164: auth,
      operationId: args.pending?.operationId ?? `recover_${Date.now()}`,
    };
  }

  return { retry: false };
}

export function resetPendingMobileContactChangeForTests(): void {
  memory.clear();
}
