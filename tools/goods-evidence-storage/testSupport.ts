import { createHash } from "node:crypto";

import { GoodsEvidenceStorageAdapter } from "./adapter";
import { FAKE_MemoryBlobStore } from "./FAKE_memoryBlobStore";
import type { G2Clock, G2LifecycleResult, G2ReserveResult } from "./types";
import type { VerifiedEvidenceResult } from "../../src/goodsEvidence/ports";

export type EvidenceLabel = "STORAGE_EMULATOR" | "FIRESTORE_EMULATOR" | "INJECTED_PORT" | "INJECTED" | "PURE_DOMAIN" | "SQLITE_HOST";

export function evidenceLabel(label: EvidenceLabel, name: string): void {
  console.log(`[${label}] ${name}`);
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const NOW = Date.UTC(2026, 9, 1, 12, 0, 0, 0);

export function testClock(utcMs = NOW): G2Clock & { seq: number } {
  const clock = {
    seq: 0,
    nowMs: () => utcMs,
    objectKey: () => (++clock.seq).toString(16).padStart(32, "0"),
  };
  return clock;
}

export function sampleBytes(fill = 7, length = 32): Uint8Array {
  return Uint8Array.from({ length }, () => fill);
}

export async function putAndVerify(input: {
  adapter: GoodsEvidenceStorageAdapter;
  blobs: FAKE_MemoryBlobStore;
  uid: string;
  ledgerId: string;
  receiptId: string;
  evidenceId: string;
  bytes: Uint8Array;
  mime?: string;
  category?: string;
}): Promise<{
  reserved: Extract<G2ReserveResult, { ok: true }>;
  verified: VerifiedEvidenceResult;
  result: Extract<G2LifecycleResult, { ok: true }>;
}> {
  const mime = input.mime ?? "application/pdf";
  const category = input.category ?? "invoice";
  const reserved = await input.adapter.reserve(
    { uid: input.uid },
    {
      evidenceId: input.evidenceId,
      ledgerId: input.ledgerId,
      receiptId: input.receiptId,
      category,
      mime,
      claimedSha256: sha256Bytes(input.bytes),
      claimedByteSize: input.bytes.byteLength,
    }
  );
  if (!reserved.ok) throw new Error(`reserve failed ${reserved.code}`);
  const began = await input.adapter.beginUpload(
    { uid: input.uid },
    { evidenceId: input.evidenceId, ledgerId: input.ledgerId }
  );
  if (!began.ok) throw new Error(`begin failed ${began.code}`);
  const put = await input.blobs.putIfAbsent(reserved.storagePath, input.bytes, mime);
  if (!put.ok) throw new Error("putIfAbsent failed");
  const completed = await input.adapter.completeUpload(
    { uid: input.uid },
    { evidenceId: input.evidenceId, ledgerId: input.ledgerId }
  );
  if (!completed.ok) throw new Error(`complete failed ${completed.code}`);
  const verified = await input.adapter.verify(
    { uid: input.uid },
    { evidenceId: input.evidenceId, ledgerId: input.ledgerId }
  );
  if (!verified.ok || !verified.verified) throw new Error("verify failed");
  return { reserved, verified: verified.verified, result: verified };
}
