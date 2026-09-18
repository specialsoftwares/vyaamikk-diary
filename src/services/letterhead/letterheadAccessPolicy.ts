/**
 * Owner-approved Round 15 letterhead commercial policy.
 *
 * Letterhead functionality is included for every user for 12 UTC calendar
 * months from that user's server-recorded signup timestamp, and remains
 * included after the anniversary until an explicitly approved successor
 * policy exists. This supersedes both the historical two-slot Option-C
 * contract and the unadopted one-slot mirror proposal.
 *
 * Signup authority is `users/{uid}.createdAt` written by
 * `resolveOrCreateUserByPhone` / `freshProfileShell`. It is not device
 * time, first letterhead use, a subscription purchase, a reinstall, a
 * plan change, or the date this policy shipped.
 */

export const LETTERHEAD_COMMERCIAL_POLICY_STATUS = "adopted" as const;
export const LETTERHEAD_COMMERCIAL_POLICY_ID = "round15-owner-approved" as const;
export const LETTERHEAD_FREE_PERIOD_CALENDAR_MONTHS = 12 as const;
export const LETTERHEAD_SIGNUP_TIMEZONE = "UTC" as const;
export const LETTERHEAD_LEAP_DAY_RULE = "clamp_to_last_valid_utc_day" as const;

/**
 * No successor pricing is adopted. After the 12-month anniversary, do not
 * auto-charge, require a paid pack, block existing documents, or restore
 * the old quota rules.
 */
export const LETTERHEAD_SUCCESSOR_PRICING_ADOPTED = false;

export const LETTERHEAD_SIGNUP_FIELD = "users/{uid}.createdAt" as const;

export const LETTERHEAD_SIGNUP_AUTHORITY = {
  field: LETTERHEAD_SIGNUP_FIELD,
  writtenBy: "functions/src/identity/shared.ts freshProfileShell via resolveOrCreateUserByPhone",
  clock: "Cloud Function server now at first profile create for that uid",
  clientWritable: false,
  deviceTime: "denied",
  firstLetterheadUse: "denied",
  subscriptionPurchase: "denied",
  reinstall: "denied",
  policyImplementationDate: "denied",
  planChange: "does_not_reset",
  renewal: "does_not_reset",
  logoutLogin: "does_not_reset — applyLoginTimestamps touches lastLoginAt only",
  missingCreatedAt: "do_not_invent — signup_unknown_pending_successor; still included pending successor",
  accountRecreation:
    "existing recreate_inactive_user / first_time_create paths write a new freshProfileShell createdAt; no extra identity-retention is added",
} as const;

export type LetterheadAccessWindow =
  | {
      kind: "included_free_period";
      signupAt: number;
      anniversaryAt: number;
    }
  | {
      kind: "included_pending_successor";
      signupAt: number;
      anniversaryAt: number;
    }
  | {
      kind: "signup_unknown_pending_successor";
      signupAt: null;
      anniversaryAt: null;
    };

function utcDaysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Add whole calendar months in UTC, clamping the day to the last valid day
 * of the target month (29 Feb → 28 Feb in a non-leap year).
 */
export function addUtcCalendarMonths(epochMs: number, months: number): number {
  if (!Number.isFinite(epochMs) || !Number.isInteger(months)) {
    throw new TypeError("invalid calendar-month input");
  }
  const source = new Date(epochMs);
  if (Number.isNaN(source.getTime())) {
    throw new TypeError("invalid calendar-month input");
  }
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const totalMonths = year * 12 + month + months;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = ((totalMonths % 12) + 12) % 12;
  const clampedDay = Math.min(day, utcDaysInMonth(nextYear, nextMonth));
  return Date.UTC(
    nextYear,
    nextMonth,
    clampedDay,
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds()
  );
}

/**
 * Trusted signup timestamp. Never invent a date for missing or malformed
 * `createdAt`.
 */
export function readServerSignupAt(createdAt: unknown): number | null {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt) || !Number.isInteger(createdAt)) {
    return null;
  }
  if (createdAt <= 0) return null;
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return createdAt;
}

export function letterheadAnniversaryUtcMs(signupAt: number): number {
  return addUtcCalendarMonths(signupAt, LETTERHEAD_FREE_PERIOD_CALENDAR_MONTHS);
}

/**
 * Classify the commercial window. `nowMs` is only for window kind; it is
 * never a signup authority. Device clocks must not be used as `createdAt`.
 */
export function letterheadAccessWindow(input: {
  signupAt: unknown;
  nowMs: number;
}): LetterheadAccessWindow {
  const signupAt = readServerSignupAt(input.signupAt);
  if (signupAt == null) {
    return { kind: "signup_unknown_pending_successor", signupAt: null, anniversaryAt: null };
  }
  const anniversaryAt = letterheadAnniversaryUtcMs(signupAt);
  if (input.nowMs < anniversaryAt) {
    return { kind: "included_free_period", signupAt, anniversaryAt };
  }
  return { kind: "included_pending_successor", signupAt, anniversaryAt };
}

/**
 * Current implemented quota behavior. A successor policy must be explicitly
 * adopted before this can return true.
 */
export function letterheadCreatesConsumeOrdinaryQuota(
  _window: LetterheadAccessWindow = letterheadAccessWindow({ signupAt: null, nowMs: 0 })
): boolean {
  if (LETTERHEAD_SUCCESSOR_PRICING_ADOPTED) {
    throw new Error("successor pricing is not implemented");
  }
  return false;
}
