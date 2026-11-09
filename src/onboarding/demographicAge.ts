/**
 * Optional demographic age band stored only on this device.
 *
 * This value is not uploaded. It is not a seal of identity and it is not
 * company analytics. A selected band, "prefer not to say", an explicit skip,
 * or an unanswered value never becomes `ageEligibility: "eligible"` and never
 * grants authorization. Profile completion does not require it.
 */

export const DEMOGRAPHIC_AGE_BANDS = [
  "under_18",
  "18_24",
  "25_34",
  "35_44",
  "45_54",
  "55_plus",
  "prefer_not_to_say",
] as const;

export type DemographicAgeBand = (typeof DEMOGRAPHIC_AGE_BANDS)[number];

/** Explicit skip. A missing device value is unanswered. Neither is eligibility. */
export const DEMOGRAPHIC_AGE_SKIPPED = "skipped" as const;

export type DemographicAgeSelection = DemographicAgeBand | typeof DEMOGRAPHIC_AGE_SKIPPED;

export function parseDemographicAgeBand(value: unknown): DemographicAgeBand | null {
  if (typeof value !== "string") return null;
  return (DEMOGRAPHIC_AGE_BANDS as readonly string[]).includes(value)
    ? (value as DemographicAgeBand)
    : null;
}

/** `skipped` and `unanswered` are the same non-answer. Bands stay bands. */
export function parseDemographicAgeSelection(value: unknown): DemographicAgeSelection | null {
  if (value === DEMOGRAPHIC_AGE_SKIPPED || value === "unanswered") return DEMOGRAPHIC_AGE_SKIPPED;
  return parseDemographicAgeBand(value);
}

export function demographicAgeStorageKey(uid: string): string {
  return `vyd_demographic_age_band_v1:${uid}`;
}

/**
 * A band, prefer-not-to-say, skip, or a missing answer never produces
 * `ageEligibility: "eligible"`.
 */
export function ageEligibilityFromDemographicAnswer(
  _answer: DemographicAgeSelection | "unanswered" | null | undefined
): null {
  return null;
}

/** Profile setup can finish with no demographic answer. */
export function profileCompletionRequiresDemographicAge(): false {
  return false;
}

export function demographicAnswerAllowsProfileCompletion(
  _answer: DemographicAgeSelection | null | undefined
): true {
  return true;
}

/** Device key/value store. Callers pass AsyncStorage. Nothing here uploads. */
export interface DemographicAgeDeviceStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export async function readDeviceDemographicAge(
  uid: string,
  store: DemographicAgeDeviceStore
): Promise<DemographicAgeSelection | null> {
  const raw = await store.getItem(demographicAgeStorageKey(uid));
  return parseDemographicAgeSelection(raw);
}

export async function writeDeviceDemographicAge(
  uid: string,
  selection: DemographicAgeSelection,
  store: DemographicAgeDeviceStore
): Promise<void> {
  // Device-only. Do not copy this into a profile patch, seal, or analytics event.
  await store.setItem(demographicAgeStorageKey(uid), selection);
}
