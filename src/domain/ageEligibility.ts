/**
 * Self-declared 18+ gate. Asia/Kolkata civil dates, completed years.
 * The eighteenth birthday is eligible. The day before is not.
 * A 29 February birthday is observed on 1 March in a non-leap year.
 * This is not an identity-document check and it does not verify the date.
 */

export const AGE_POLICY_VERSION = "self-declared-dob-18-ist-2026-10";
export const AGE_MINIMUM_YEARS = 18;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type AgeEligibility = "eligible" | "ineligible" | "unassessed";

export type AgeAssessment =
  | {
      ok: true;
      eligible: boolean;
      ageEligibility: "eligible" | "ineligible";
      policyVersion: string;
      assessedAt: number;
      method: "self_declared_dob";
    }
  | { ok: false; reason: "malformed" | "impossible" | "future" | "forged" };

export function istCivilDate(nowMs: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month] ?? 0;
}

/** Birthday observed in `year`. 29 February moves to 1 March when `year` is not a leap year. */
export function observedBirthday(
  year: number,
  birthMonth: number,
  birthDay: number
): { month: number; day: number } {
  if (birthMonth === 2 && birthDay === 29 && !isLeapYear(year)) {
    return { month: 3, day: 1 };
  }
  return { month: birthMonth, day: birthDay };
}

export function completedYears(
  birth: { year: number; month: number; day: number },
  today: { year: number; month: number; day: number }
): number {
  const observed = observedBirthday(today.year, birth.month, birth.day);
  const beforeBirthday =
    today.month < observed.month || (today.month === observed.month && today.day < observed.day);
  return today.year - birth.year - (beforeBirthday ? 1 : 0);
}

export function assessSelfDeclaredDob(input: {
  dateOfBirth: unknown;
  nowMs: number;
  clientClaim?: unknown;
}): AgeAssessment {
  if (input.clientClaim !== undefined) return { ok: false, reason: "forged" };
  if (typeof input.dateOfBirth !== "string" || !DATE_RE.test(input.dateOfBirth)) {
    return { ok: false, reason: "malformed" };
  }
  const match = DATE_RE.exec(input.dateOfBirth);
  if (!match) return { ok: false, reason: "malformed" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, reason: "impossible" };
  }
  const today = istCivilDate(input.nowMs);
  if (
    year > today.year ||
    (year === today.year && month > today.month) ||
    (year === today.year && month === today.month && day > today.day)
  ) {
    return { ok: false, reason: "future" };
  }
  const age = completedYears({ year, month, day }, today);
  const eligible = age >= AGE_MINIMUM_YEARS;
  return {
    ok: true,
    eligible,
    ageEligibility: eligible ? "eligible" : "ineligible",
    policyVersion: AGE_POLICY_VERSION,
    assessedAt: input.nowMs,
    method: "self_declared_dob",
  };
}

/** Optional profile-details demographic band. This is not a date of birth and not eligibility. */
export const DEMOGRAPHIC_AGE_RANGES = [
  "under_18",
  "18_24",
  "25_34",
  "35_44",
  "45_54",
  "55_plus",
  "prefer_not_to_say",
] as const;

export type DemographicAgeRange = (typeof DEMOGRAPHIC_AGE_RANGES)[number];

export const DEMOGRAPHIC_AGE_RANGE_LABELS: Record<DemographicAgeRange, string> = {
  under_18: "Under 18",
  "18_24": "18–24",
  "25_34": "25–34",
  "35_44": "35–44",
  "45_54": "45–54",
  "55_plus": "55+",
  prefer_not_to_say: "Prefer not to say",
};

export function parseDemographicAgeRange(value: unknown): DemographicAgeRange | null {
  if (typeof value !== "string") return null;
  return (DEMOGRAPHIC_AGE_RANGES as readonly string[]).includes(value)
    ? (value as DemographicAgeRange)
    : null;
}

export function demographicAgeStorageKey(uid: string): string {
  return `vyd_demographic_age_range_v1:${uid}`;
}

export type SignedInOnboardingContinuation = "email" | "profile" | "dashboard";

/**
 * Next signed-in step after phone verification. Demographic age and sealed
 * `ageEligibility` are not routes. Missing age continues; it does not open
 * the legacy date-of-birth screen.
 */
export function resolveSignedInOnboardingContinuation(input: {
  hasVerifiedEmail: boolean;
  profileCompletedAt?: number | null;
  ageEligibility?: string | null;
  demographicAgeRange?: string | null;
}): SignedInOnboardingContinuation {
  void input.ageEligibility;
  void input.demographicAgeRange;
  if (input.hasVerifiedEmail && input.profileCompletedAt) return "dashboard";
  if (input.hasVerifiedEmail) return "profile";
  return "email";
}

/**
 * Launch check. Demographic age is not an authentication gate, and a missing
 * or unassessed sealed eligibility must not redirect to age declaration.
 * Sealed business writes still require `ageEligibility === "eligible"`
 * (`age_not_admitted`) on the server.
 */
export function profileNeedsAgeGate(
  profile: {
    ageEligibility?: string | null;
    demographicAgeRange?: string | null;
  } | null | undefined
): boolean {
  void profile;
  return false;
}
