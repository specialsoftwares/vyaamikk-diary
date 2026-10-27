/**
 * Account-key bytes come from the platform CSPRNG.
 * expo-crypto getRandomValues uses SecureRandom on Android.
 * The development byte helper is not used.
 */

const MIN_LENGTH = 1;
const MAX_LENGTH = 1024;

type Fill = (bytes: Uint8Array) => Uint8Array | null;

let override: Fill | null = null;

/** Host tests supply the bytes. Production leaves this unset. */
export function __setNativeSecureRandomForTests(next: Fill | null): void {
  override = next;
}

export function readNativeSecureRandom(length: number): Uint8Array | null {
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) return null;
  const bytes = new Uint8Array(length);
  try {
    const filled = override ? override(bytes) : fillFromExpoCrypto(bytes);
    if (!(filled instanceof Uint8Array) || filled.length !== length) return null;
    if (filled !== bytes) bytes.set(filled);
    return bytes;
  } catch {
    return null;
  }
}

function fillFromExpoCrypto(bytes: Uint8Array): Uint8Array | null {
  try {
    // Metro loads this native module. A static import would pull it into host tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("expo-crypto") as {
      getRandomValues?: (target: Uint8Array) => Uint8Array;
    };
    if (typeof crypto.getRandomValues !== "function") return hostCryptoOrClosed(bytes);
    const filled = crypto.getRandomValues(bytes);
    if (!(filled instanceof Uint8Array) || filled.length !== bytes.length) return null;
    return filled;
  } catch {
    return hostCryptoOrClosed(bytes);
  }
}

/** Node keeps a CSPRNG. React Native does not use this fallback. */
function hostCryptoOrClosed(bytes: Uint8Array): Uint8Array | null {
  const product = typeof navigator === "undefined" ? "" : navigator.product;
  if (product === "ReactNative") return null;
  const random = globalThis.crypto?.getRandomValues;
  if (typeof random !== "function") return null;
  random.call(globalThis.crypto, bytes);
  return bytes;
}
