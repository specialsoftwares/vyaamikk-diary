/**
 * Validate and compare server-confirmed receipt projections.
 * Do not invent original / events / effective when the server did not return them.
 */
import type { GrinConfirmedProjection, GrinEvent } from "@/goodsEvidence/ports";
import type { ImmutableGrin } from "@/goodsEvidence/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * eventVersion must be a positive integer. hashes / original / events / effective
 * must JSON-parse. Invalid shapes return null — callers must not persist them.
 */
export function parseConfirmedProjection(
  raw: unknown,
  expectedReceiptId?: string
): GrinConfirmedProjection | null {
  if (!isPlainObject(raw)) return null;
  const receiptId = raw.receiptId;
  if (typeof receiptId !== "string" || !receiptId.trim()) return null;
  if (expectedReceiptId && receiptId !== expectedReceiptId) return null;
  if (!isPositiveInteger(raw.eventVersion)) return null;
  if (typeof raw.headHash !== "string" || !raw.headHash.trim()) return null;
  if (!isPlainObject(raw.original) || !isPlainObject(raw.effective)) return null;
  if (!Array.isArray(raw.events)) return null;
  try {
    const original = jsonClone(raw.original) as unknown as ImmutableGrin;
    const effective = jsonClone(raw.effective) as unknown as ImmutableGrin;
    const events = jsonClone(raw.events) as unknown as GrinEvent[];
    if (!isPlainObject(original) || !isPlainObject(effective) || !Array.isArray(events)) {
      return null;
    }
    return {
      receiptId,
      eventVersion: raw.eventVersion,
      headHash: raw.headHash,
      original,
      events,
      effective,
    };
  } catch {
    return null;
  }
}

export function confirmedProjectionJson(confirmed: GrinConfirmedProjection): {
  original: string;
  events: string;
  effective: string;
} {
  return {
    original: JSON.stringify(confirmed.original),
    events: JSON.stringify(confirmed.events),
    effective: JSON.stringify(confirmed.effective),
  };
}

export function sameConfirmedProjection(
  left: GrinConfirmedProjection,
  right: GrinConfirmedProjection
): boolean {
  if (left.receiptId !== right.receiptId) return false;
  if (left.eventVersion !== right.eventVersion) return false;
  if (left.headHash !== right.headHash) return false;
  const a = confirmedProjectionJson(left);
  const b = confirmedProjectionJson(right);
  return a.original === b.original && a.events === b.events && a.effective === b.effective;
}
