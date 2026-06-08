/**
 * Lightweight unique-ID helpers that don't require the `uuid` package
 * (which historically pulled in `crypto` shims on React Native).
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function shortId(prefix = ""): string {
  let s = "";
  for (let i = 0; i < 10; i += 1) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return prefix ? `${prefix}_${Date.now().toString(36)}_${s}` : `${Date.now().toString(36)}_${s}`;
}
