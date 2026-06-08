import type { BusinessEntry, BusinessEntryType } from "./businessEntry";

/** Unified Work & Team Notes category — internal entry types unchanged. */
export const WORK_TEAM_ENTRY_TYPES: readonly BusinessEntryType[] = [
  "work_update_issue",
  "staff_matter",
] as const;

export function isWorkTeamEntryType(type: BusinessEntryType): boolean {
  return (WORK_TEAM_ENTRY_TYPES as readonly string[]).includes(type);
}

export function entryMatchesWorkTeamFilter(entry: BusinessEntry): boolean {
  return isWorkTeamEntryType(entry.entryType);
}
