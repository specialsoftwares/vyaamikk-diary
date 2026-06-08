import * as FileSystem from "expo-file-system/legacy";

import type { AttachmentRef } from "@/domain/businessEntry";

/** Delete a file only when it lives under app-controlled directories. */
export async function deleteAppControlledFile(
  uri: string | null | undefined
): Promise<void> {
  const trimmed = uri?.trim();
  if (!trimmed) return;

  const docRoot = FileSystem.documentDirectory ?? "";
  const cacheRoot = FileSystem.cacheDirectory ?? "";
  const isAppControlled =
    (docRoot && trimmed.startsWith(docRoot)) ||
    (cacheRoot && trimmed.startsWith(cacheRoot));

  if (!isAppControlled) return;

  try {
    await FileSystem.deleteAsync(trimmed, { idempotent: true });
  } catch {
    // Best-effort — OS may reclaim temp files later.
  }
}

export async function deleteAttachmentFiles(
  attachments: AttachmentRef[] | null | undefined
): Promise<void> {
  if (!attachments?.length) return;
  await Promise.all(attachments.map((a) => deleteAppControlledFile(a.uri)));
}

export async function deleteGeneratedPdfUri(
  pdfUri: string | null | undefined
): Promise<void> {
  await deleteAppControlledFile(pdfUri);
}
