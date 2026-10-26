/**
 * Cryptographic bytes for account keys and AES-GCM nonces.
 *
 * The signed Expo SDK 54 / React Native 0.81 Android runtime does not provide
 * globalThis.crypto.getRandomValues. Hermes does not implement it, and this
 * app's React Native package does not polyfill it. expo-crypto's native
 * getRandomValues uses java.security.SecureRandom on Android.
 *
 * getRandomBytes is not used: in development it fills bytes with Math.random.
 */

export type NativeRandomResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; cause: unknown };

type ExpoRandomModule = {
  getRandomValues?: (typedArray: Uint8Array) => Uint8Array;
};

export function readNativeSecureRandom(length: number): NativeRandomResult {
  if (!Number.isInteger(length) || length < 1 || length > 1024) {
    return { ok: false, cause: new Error("invalid random length") };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-crypto") as ExpoRandomModule;
    if (typeof mod.getRandomValues !== "function") {
      return { ok: false, cause: new Error("expo-crypto getRandomValues missing") };
    }
    const bytes = new Uint8Array(length);
    mod.getRandomValues(bytes);
    if (bytes.byteLength !== length) {
      return { ok: false, cause: new Error("short random") };
    }
    return { ok: true, bytes };
  } catch (cause) {
    return { ok: false, cause };
  }
}
