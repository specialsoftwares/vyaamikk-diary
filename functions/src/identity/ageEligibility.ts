/**
 * Server copy of the app age policy. Keep the decisions identical to
 * src/domain/ageEligibility.ts. Functions cannot import the app tree.
 */

export const AGE_POLICY_VERSION = "self-declared-dob-18-ist-2026-10";
export const AGE_MINIMUM_YEARS = 18;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

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

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month] ?? 0;
}

function observedBirthday(
  year: number,
  birthMonth: number,
  birthDay: number
): { month: number; day: number } {
  if (birthMonth === 2 && birthDay === 29 && !isLeapYear(year)) {
    return { month: 3, day: 1 };
  }
  return { month: birthMonth, day: birthDay };
}

function completedYears(
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
