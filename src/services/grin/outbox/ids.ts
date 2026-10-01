const ID_RE = /^[A-Za-z0-9_-]+$/;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

function randomChars(count: number): string {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!;
  }
  return out;
}

export function mintCommandId(): string {
  return `gcmd_${randomChars(16)}`;
}

export function mintReceiptId(): string {
  return `grcp_${randomChars(12)}`;
}

export function mintWorkerId(): string {
  return `gwrk_${randomChars(10)}`;
}

/** Unique identity for one lease acquisition. Not worker name + generation. */
export function mintAttemptId(): string {
  return `gatt_${randomChars(20)}`;
}

export function assertCommandId(commandId: string): void {
  if (commandId.length < 8 || commandId.length > 128 || !ID_RE.test(commandId) || FORBIDDEN.has(commandId)) {
    throw new Error("invalid_command_id");
  }
}

export function assertReceiptId(receiptId: string): void {
  if (receiptId.length < 1 || receiptId.length > 64 || !ID_RE.test(receiptId) || FORBIDDEN.has(receiptId)) {
    throw new Error("invalid_receipt_id");
  }
}

export function assertLedgerId(ledgerId: string): void {
  if (ledgerId.length < 1 || ledgerId.length > 64 || !ID_RE.test(ledgerId) || FORBIDDEN.has(ledgerId)) {
    throw new Error("invalid_ledger_id");
  }
}

export function assertOwnerUid(ownerUid: string): void {
  if (!ownerUid || ownerUid.length > 128 || ownerUid.includes("/") || ownerUid.includes("\t")) {
    throw new Error("invalid_owner_uid");
  }
}

export function receiptRowId(ownerUid: string, ledgerId: string, receiptId: string): string {
  return `${ownerUid}\t${ledgerId}\t${receiptId}`;
}

export function commandRowId(ownerUid: string, ledgerId: string, commandId: string): string {
  return `${ownerUid}\t${ledgerId}\t${commandId}`;
}

export function evidenceRowId(
  ownerUid: string,
  ledgerId: string,
  evidenceId: string,
  role: string
): string {
  return `${ownerUid}\t${ledgerId}\t${evidenceId}\t${role}`;
}
