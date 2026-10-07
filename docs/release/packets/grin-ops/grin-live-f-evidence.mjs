/**
 * Focused LIVE F evidence assertions (no secrets).
 */
export function assertUnauthenticatedDenial(http, res) {
  const code = String(res?.code || res?.status || "").toLowerCase();
  if (code === "unauthenticated") return true;
  if (http === 401 && (res?.ok === false || code.includes("unauth"))) return true;
  return false;
}

export function assertConfirmedProjection(confirmed, expected) {
  if (!confirmed || typeof confirmed !== "object") return { ok: false, reason: "missing_confirmed" };
  if (String(confirmed.receiptId || "") !== expected.receiptId) {
    return { ok: false, reason: "receipt_mismatch" };
  }
  const original = confirmed.original;
  if (original && typeof original === "object") {
    if (original.ownerUid != null && String(original.ownerUid) !== expected.ownerUid) {
      return { ok: false, reason: "owner_mismatch" };
    }
    if (original.receiptId != null && String(original.receiptId) !== expected.receiptId) {
      return { ok: false, reason: "original_receipt_mismatch" };
    }
  }
  if (confirmed.eventVersion == null && confirmed.headHash == null) {
    return { ok: false, reason: "missing_version_or_hash" };
  }
  if (confirmed.eventVersion != null && typeof confirmed.eventVersion !== "number") {
    return { ok: false, reason: "bad_event_version" };
  }
  if (confirmed.headHash != null && typeof confirmed.headHash !== "string") {
    return { ok: false, reason: "bad_head_hash" };
  }
  return { ok: true };
}

export function assertReplayPreservesIssuance(first, replay) {
  if (!first || !replay) return false;
  if (replay.ok !== true || replay.replayed !== true) return false;
  if (replay.issuedNumber !== first.issuedNumber) return false;
  const firstReceipt = String(first.receiptId || "");
  const replayReceipt = String(replay.receiptId || firstReceipt);
  if (!firstReceipt || replayReceipt !== firstReceipt) return false;
  return true;
}
