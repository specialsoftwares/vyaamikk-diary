import { shortId } from "@/utils/id";

/** Resolve the Firestore / local document id for an idempotent create. */
export function stableRecordId(
  clientRecordId: string | undefined,
  fallbackPrefix: string
): string {
  const trimmed = clientRecordId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : shortId(fallbackPrefix);
}
