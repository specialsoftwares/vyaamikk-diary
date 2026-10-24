/**
 * Key for retained on-device private text. Logout keeps it so the same
 * account can read what it queued. Account deletion removes it. Another
 * account's key does not open this account's ciphertext.
 */

export type LocalKeyStore = {
  get(uid: string): Promise<Uint8Array | null>;
  set(uid: string, key: Uint8Array): Promise<void>;
  delete(uid: string): Promise<void>;
};

export function createStorageLocalKeyStore(storage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}): LocalKeyStore {
  const prefix = "vyd_local_data_key_v1_";
  return {
    async get(uid: string) {
      const raw = await storage.getItem(prefix + uid);
      return raw ? base64ToBytes(raw) : null;
    },
    async set(uid: string, key: Uint8Array) {
      await storage.setItem(prefix + uid, bytesToBase64(key));
    },
    async delete(uid: string) {
      await storage.removeItem(prefix + uid);
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

async function aesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return crypto.subtle.importKey("raw", copy, "AES-GCM", false, usages);
}

export async function ensureLocalDataKey(store: LocalKeyStore, uid: string): Promise<Uint8Array> {
  const existing = await store.get(uid);
  if (existing && existing.byteLength === 32) return existing;
  const created = crypto.getRandomValues(new Uint8Array(32));
  await store.set(uid, created);
  return created;
}

export async function sealLocalText(key: Uint8Array, plaintext: string): Promise<string> {
  const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(12)));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(key, ["encrypt"]),
    new TextEncoder().encode(plaintext)
  );
  return JSON.stringify({
    v: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipher)),
  });
}

export async function openLocalText(key: Uint8Array, sealed: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(sealed) as { v?: unknown; iv?: unknown; ciphertext?: unknown };
    if (parsed.v !== 1 || typeof parsed.iv !== "string" || typeof parsed.ciphertext !== "string") return null;
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(base64ToBytes(parsed.iv)) },
      await aesKey(key, ["decrypt"]),
      new Uint8Array(base64ToBytes(parsed.ciphertext))
    );
    return new TextDecoder().decode(clear);
  } catch {
    return null;
  }
}
