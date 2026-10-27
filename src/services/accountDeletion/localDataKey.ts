/**
 * Account-bound key for retained on-device private text.
 * Logout keeps the key. Account deletion removes it.
 * Production stores it in the OS secure store. A raw key is not written
 * back to AsyncStorage. A missing key is not replaced while sealed data remains.
 */

import { gcm } from "@noble/ciphers/aes";

import { readNativeSecureRandom } from "./nativeSecureRandom";

export type LocalKeyFailure =
  | "secure_store_unavailable"
  | "secure_random_unavailable"
  | "key_missing"
  | "key_corrupt"
  | "key_conflict"
  | "migration_incomplete";

export class LocalKeyUnavailable extends Error {
  readonly reason: LocalKeyFailure;

  constructor(reason: LocalKeyFailure) {
    super(reason);
    this.name = "LocalKeyUnavailable";
    this.reason = reason;
  }
}

export type LocalKeyResult =
  | { state: "ready"; key: Uint8Array }
  | { state: "unavailable"; reason: LocalKeyFailure };

export type LocalKeyStore = {
  get(uid: string): Promise<Uint8Array | null>;
  set(uid: string, key: Uint8Array): Promise<void>;
  delete(uid: string): Promise<void>;
};

export type LegacyKeyReader = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
};

const LEGACY_PREFIX = "vyd_local_data_key_v1_";

/**
 * Test double of the old AsyncStorage writer. Production does not use this
 * to persist a new key.
 */
export function createStorageLocalKeyStore(storage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}): LocalKeyStore {
  return {
    async get(uid: string) {
      const raw = await storage.getItem(LEGACY_PREFIX + uid);
      return decodeKey(raw);
    },
    async set(uid: string, key: Uint8Array) {
      await storage.setItem(LEGACY_PREFIX + uid, bytesToBase64(key));
    },
    async delete(uid: string) {
      await storage.removeItem(LEGACY_PREFIX + uid);
    },
  };
}

export function createMemoryLocalKeyStore(): LocalKeyStore {
  const keys = new Map<string, Uint8Array>();
  return {
    async get(uid: string) {
      const found = keys.get(uid);
      return found ? new Uint8Array(found) : null;
    },
    async set(uid: string, key: Uint8Array) {
      keys.set(uid, new Uint8Array(key));
    },
    async delete(uid: string) {
      keys.delete(uid);
    },
  };
}

export type SecureKeyApi = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string, options?: { keychainAccessible?: string }): Promise<void>;
  deleteItem(key: string): Promise<void>;
};

/** Items with this accessibility are not included in a device backup. */
export const LOCAL_KEY_ACCESSIBILITY = "after_first_unlock_this_device_only";

export function secureKeyName(uid: string): string {
  const safe = uid.replace(/[^A-Za-z0-9._-]/g, "_");
  if (!safe) throw new LocalKeyUnavailable("key_corrupt");
  return `vyd.ldk.v1.${safe}`;
}

/**
 * OS-backed store. `legacy` is read and deleted after a verified copy.
 * It is never given a new key. `secure` throwing is unavailability, not a
 * reason to write the raw key anywhere else.
 */
export function createSecureLocalKeyStore(input: {
  secure: SecureKeyApi;
  legacy: LegacyKeyReader | null;
  accessibility: string;
}): LocalKeyStore {
  const options = { keychainAccessible: input.accessibility };
  return {
    async get(uid: string) {
      let raw: string | null;
      try {
        raw = await input.secure.getItem(secureKeyName(uid));
      } catch {
        throw new LocalKeyUnavailable("secure_store_unavailable");
      }
      if (raw == null) return null;
      const decoded = decodeKey(raw);
      if (!decoded) throw new LocalKeyUnavailable("key_corrupt");
      return decoded;
    },
    async set(uid: string, key: Uint8Array) {
      try {
        await input.secure.setItem(secureKeyName(uid), bytesToBase64(key), options);
        const readBack = decodeKey(await input.secure.getItem(secureKeyName(uid)));
        if (!readBack || !equalBytes(readBack, key)) throw new LocalKeyUnavailable("migration_incomplete");
      } catch (error) {
        if (error instanceof LocalKeyUnavailable) throw error;
        throw new LocalKeyUnavailable("secure_store_unavailable");
      }
    },
    async delete(uid: string) {
      try {
        await input.secure.deleteItem(secureKeyName(uid));
      } catch {
        throw new LocalKeyUnavailable("secure_store_unavailable");
      }
      if (input.legacy) await input.legacy.removeItem(LEGACY_PREFIX + uid);
    },
  };
}

const inflight = new Map<string, Promise<LocalKeyResult>>();

export async function resolveLocalDataKey(
  store: LocalKeyStore,
  uid: string,
  options?: { retainedCiphertext?: boolean; legacy?: LegacyKeyReader | null }
): Promise<LocalKeyResult> {
  const current = inflight.get(uid);
  if (current) return current;
  const pending = resolveOnce(store, uid, options);
  inflight.set(uid, pending);
  try {
    return await pending;
  } finally {
    inflight.delete(uid);
  }
}

async function resolveOnce(
  store: LocalKeyStore,
  uid: string,
  options?: { retainedCiphertext?: boolean; legacy?: LegacyKeyReader | null }
): Promise<LocalKeyResult> {
  const retained = options?.retainedCiphertext === true;
  let secure: Uint8Array | null = null;
  let secureCorrupt = false;
  try {
    secure = await store.get(uid);
  } catch (error) {
    if (error instanceof LocalKeyUnavailable && error.reason === "key_corrupt") secureCorrupt = true;
    else if (error instanceof LocalKeyUnavailable) return { state: "unavailable", reason: error.reason };
    else return { state: "unavailable", reason: "secure_store_unavailable" };
  }
  const legacyRaw = options?.legacy ? await options.legacy.getItem(LEGACY_PREFIX + uid) : null;
  const legacy = decodeKey(legacyRaw);
  const legacyCorrupt = legacyRaw != null && !legacy;
  if (secureCorrupt) {
    return { state: "unavailable", reason: "key_corrupt" };
  }
  if (secure && legacy && !equalBytes(secure, legacy)) {
    return { state: "unavailable", reason: "key_conflict" };
  }
  if (secure) {
    if (legacyRaw && options?.legacy) await options.legacy.removeItem(LEGACY_PREFIX + uid);
    return { state: "ready", key: secure };
  }
  if (legacyCorrupt || (retained && !legacy)) {
    return { state: "unavailable", reason: legacyCorrupt ? "key_corrupt" : "key_missing" };
  }
  if (legacy) {
    try {
      await store.set(uid, legacy);
    } catch (error) {
      const reason = error instanceof LocalKeyUnavailable ? error.reason : "migration_incomplete";
      return { state: "unavailable", reason };
    }
    if (options?.legacy) await options.legacy.removeItem(LEGACY_PREFIX + uid);
    return { state: "ready", key: legacy };
  }
  if (retained) return { state: "unavailable", reason: "key_missing" };
  let created: Uint8Array;
  try {
    created = randomBytes(32);
  } catch (error) {
    const reason = error instanceof LocalKeyUnavailable ? error.reason : "secure_random_unavailable";
    return { state: "unavailable", reason };
  }
  try {
    await store.set(uid, created);
  } catch (error) {
    const reason = error instanceof LocalKeyUnavailable ? error.reason : "secure_store_unavailable";
    return { state: "unavailable", reason };
  }
  return { state: "ready", key: created };
}

export async function ensureLocalDataKey(store: LocalKeyStore, uid: string): Promise<Uint8Array> {
  const resolved = await resolveLocalDataKey(store, uid);
  if (resolved.state !== "ready") throw new LocalKeyUnavailable(resolved.reason);
  return resolved.key;
}

export function sealLocalTextSync(key: Uint8Array, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = gcm(copyBytes(key), iv).encrypt(new TextEncoder().encode(plaintext));
  return JSON.stringify({
    v: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(cipher),
  });
}

export function openLocalTextSync(key: Uint8Array, sealed: string): string | null {
  try {
    const parsed = JSON.parse(sealed) as { v?: unknown; iv?: unknown; ciphertext?: unknown };
    if (parsed.v !== 1 || typeof parsed.iv !== "string" || typeof parsed.ciphertext !== "string") return null;
    const clear = gcm(copyBytes(key), copyBytes(base64ToBytes(parsed.iv))).decrypt(copyBytes(base64ToBytes(parsed.ciphertext)));
    return new TextDecoder().decode(clear);
  } catch {
    return null;
  }
}

export async function sealLocalText(key: Uint8Array, plaintext: string): Promise<string> {
  return sealLocalTextSync(key, plaintext);
}

export async function openLocalText(key: Uint8Array, sealed: string): Promise<string | null> {
  return openLocalTextSync(key, sealed);
}

/** Noble AES-GCM. The production functions do not call WebCrypto. */
export function localCipherWorksWithoutWebCrypto(): boolean {
  const key = randomBytes(32);
  const sealed = sealLocalTextSync(key, "site note");
  const source = `${sealLocalTextSync}\n${openLocalTextSync}`;
  return openLocalTextSync(key, sealed) === "site note" && !source.includes("subtle");
}

function randomBytes(length: number): Uint8Array {
  const bytes = readNativeSecureRandom(length);
  if (!bytes) throw new LocalKeyUnavailable("secure_random_unavailable");
  return bytes;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < left.byteLength; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function decodeKey(raw: string | null): Uint8Array | null {
  if (!raw) return null;
  try {
    const bytes = base64ToBytes(raw);
    return bytes.byteLength === 32 ? bytes : null;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function base64ToBytes(value: string): Uint8Array {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}
