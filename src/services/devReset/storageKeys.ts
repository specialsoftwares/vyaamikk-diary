/** AsyncStorage / SecureStore key patterns cleared during dev reset. */

export const DEV_ASYNC_PREFIXES = ["vyd_", "vyaamikk:"] as const;

export const DEV_ASYNC_EXACT_KEYS = [
  "vyd_mock_registry_v1",
  "vyd_session_v1",
  "vyd_session_v2",
  "vyd_retired_phones_v1",
  "vyd_global_search_recent_v1",
  "vyd_pdf_cloud_backup_v1",
  "vyd_auth_v2_challenge",
  "vyd_lang_v1",
  "vyd_theme_mode_v1",
  "vyd_sub_cache_v1",
  "vyd_pending_purchase_v1",
  "vyaamikk:hasSeenIntroSplash",
] as const;

export function isDevStorageKey(key: string): boolean {
  if ((DEV_ASYNC_EXACT_KEYS as readonly string[]).includes(key)) return true;
  return DEV_ASYNC_PREFIXES.some((p) => key.startsWith(p));
}

export function userScopedDevKeySuffixes(userId: string): string[] {
  return [
    userId,
    `vyd_diary_v2_${userId}`,
    `vyd_diary_v1_${userId}`,
    `vyd_pro_pack_v1_${userId}`,
    `vyd_letterhead_v1_${userId}`,
    `vyd_letterhead_docs_v1_${userId}`,
    `vyd_location_footprints_v1_${userId}`,
    `vyd_statutory_prompt_day_${userId}`,
    `vyd_draft_boot_snooze_${userId}`,
    `vyd_auth_v2_email_pending_${userId}`,
    `vyaamikk:hasSeenIntroSplash:${userId}`,
  ];
}
