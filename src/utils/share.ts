import { Share } from "react-native";

import type { BusinessEntry } from "@/domain/businessEntry";
import { buildBusinessEntryShareText } from "@/services/share/shareTextBuilders";
import { shareBusinessEntryText } from "@/services/share/shareTextService";

/** Privacy-safe share text — no UEID or internal metadata. */
export function formatEntryForShare(
  entry: BusinessEntry,
  _ueid: string | null,
  t: (k: string, vars?: Record<string, string | number>) => string
): string {
  return buildBusinessEntryShareText(entry, { t });
}

export async function shareEntry(
  entry: BusinessEntry,
  _ueid: string | null,
  t: (k: string, vars?: Record<string, string | number>) => string
): Promise<void> {
  await shareBusinessEntryText(entry, { t });
}
