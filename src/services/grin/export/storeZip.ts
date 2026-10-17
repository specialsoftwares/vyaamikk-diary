/**
 * Optional STORE-method ZIP (no compression, no extra dependency).
 * Not a complete archive of all cloud originals — only files the caller supplies.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  const time =
    ((d.getUTCHours() & 0x1f) << 11) |
    ((d.getUTCMinutes() & 0x3f) << 5) |
    ((Math.floor(d.getUTCSeconds() / 2) & 0x1f) << 0);
  const date =
    (((d.getUTCFullYear() - 1980) & 0x7f) << 9) |
    (((d.getUTCMonth() + 1) & 0xf) << 5) |
    (d.getUTCDate() & 0x1f);
  return { time, date };
}

function u16(n: number): Uint8Array {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff);
}
function u32(n: number): Uint8Array {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

export type ZipEntry = { name: string; bytes: Uint8Array };

export const MAX_ZIP_ENTRY_NAME_BYTES = 255;
/** ZIP32 limits (no ZIP64 support in this STORE writer). */
export const MAX_ZIP32_ENTRIES = 0xffff;
export const MAX_ZIP32_ENTRY_BYTES = 0xffffffff;

export type ZipEntryNameRejection =
  | "empty"
  | "too_long"
  | "absolute"
  | "backslash"
  | "control_char"
  | "dot_segment"
  | "empty_segment"
  | "drive_or_scheme";

/**
 * Archive entry names must be plain relative paths an extractor cannot turn
 * into traversal or absolute writes: no `..`/`.` segments, no leading `/`,
 * no backslashes, no control characters, no `C:` / `scheme:` prefixes.
 */
export function zipEntryNameRejection(name: string): ZipEntryNameRejection | null {
  if (name.length === 0) return "empty";
  if (new TextEncoder().encode(name).byteLength > MAX_ZIP_ENTRY_NAME_BYTES) return "too_long";
  if (name.startsWith("/")) return "absolute";
  if (name.includes("\\")) return "backslash";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return "control_char";
  const segments = name.split("/");
  if (segments[0]!.includes(":")) return "drive_or_scheme";
  for (const segment of segments) {
    if (segment === "") return "empty_segment";
    if (segment === "." || segment === "..") return "dot_segment";
  }
  return null;
}

export function isSafeZipEntryName(name: string): boolean {
  return zipEntryNameRejection(name) === null;
}

export class ZipEntryError extends Error {
  constructor(
    public readonly code: "unsafe_entry_name" | "duplicate_entry_name" | "zip32_limit",
    public readonly entryName: string | null = null
  ) {
    super(code);
    this.name = "ZipEntryError";
  }
}

/**
 * Validate every entry before any bytes are laid out. Duplicate detection is
 * case-insensitive because the archive may be extracted on a case-insensitive
 * filesystem where two entries would silently overwrite each other.
 */
export function assertZipEntries(entries: readonly ZipEntry[]): void {
  if (entries.length > MAX_ZIP32_ENTRIES) throw new ZipEntryError("zip32_limit");
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!isSafeZipEntryName(entry.name)) throw new ZipEntryError("unsafe_entry_name", entry.name);
    if (entry.bytes.byteLength > MAX_ZIP32_ENTRY_BYTES) throw new ZipEntryError("zip32_limit", entry.name);
    const key = entry.name.toLowerCase();
    if (seen.has(key)) throw new ZipEntryError("duplicate_entry_name", entry.name);
    seen.add(key);
  }
}

export function buildStoreZip(entries: ZipEntry[], nowMs = 0): Uint8Array {
  assertZipEntries(entries);
  const { time, date } = dosDateTime(nowMs);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = concat([
      Uint8Array.of(0x50, 0x4b, 0x03, 0x04),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(entry.bytes.byteLength),
      u32(entry.bytes.byteLength),
      u16(nameBytes.byteLength),
      u16(0),
      nameBytes,
      entry.bytes,
    ]);
    locals.push(local);
    const central = concat([
      Uint8Array.of(0x50, 0x4b, 0x01, 0x02),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(entry.bytes.byteLength),
      u32(entry.bytes.byteLength),
      u16(nameBytes.byteLength),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centrals.push(central);
    offset += local.byteLength;
  }
  const centralDir = concat(centrals);
  const eocd = concat([
    Uint8Array.of(0x50, 0x4b, 0x05, 0x06),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.byteLength),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, centralDir, eocd]);
}
