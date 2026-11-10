/**
 * Optional age-band question.
 *
 * An age-band metric was requested for understanding who uses the product.
 * This build stores the answer only on the device for the signed-in owner.
 * It is not uploaded and is not company analytics.
 * Any later server aggregate would need a separate consent-aware count with no user id, no record contents, and a non-blocking write.
 * That server path is not implemented.
 *
 * A selected band, "prefer not to say", an explicit skip, or an unanswered
 * value never becomes `ageEligibility: "eligible"` and never grants
 * authorization. Profile completion does not require it. The device key is
 * `vyd_demographic_age_band_v1:${uid}`.
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

/** How long profile setup will wait before treating demographic storage as unanswered. */
export const DEMOGRAPHIC_AGE_LOAD_BOUND_MS = 300;

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

/** True only while the caller still holds the revision captured when the read started. */
export function shouldApplyDemographicAgeRead(revisionAtStart: number, revisionNow: number): boolean {
  return revisionNow === revisionAtStart;
}

/** Device key/value store. Callers pass AsyncStorage. Nothing here uploads. */
export interface DemographicAgeDeviceStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Clock for the demographic read bound. Tests advance `now` and release
 * `delay` without waiting on a wall clock. Production uses timers.
 */
export interface DemographicAgeClock {
  now(): number;
  delay(ms: number): { done: Promise<void>; cancel(): void };
}

export function systemDemographicAgeClock(): DemographicAgeClock {
  return {
    now: () => Date.now(),
    delay(ms: number) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });
      return {
        done,
        cancel() {
          if (timer !== undefined) clearTimeout(timer);
          timer = undefined;
        },
      };
    },
  };
}

export type DemographicAgeLoadStatus = "ready" | "timeout" | "failed" | "stale";

/**
 * Reads the saved band without holding profile setup.
 * `settled` resolves by the bound even when storage hangs.
 * A read that finishes after a newer selection — including Prefer not to say
 * or skipped — does not call `onSelection`. A slow read may still report the
 * saved answer when the revision is unchanged.
 */
export function watchDeviceDemographicAge(input: {
  uid: string;
  store: Pick<DemographicAgeDeviceStore, "getItem">;
  boundMs?: number;
  clock?: DemographicAgeClock;
  revisionAtStart: number;
  currentRevision: () => number;
  onSelection: (selection: DemographicAgeSelection | null) => void;
}): { settled: Promise<DemographicAgeLoadStatus> } {
  const clock = input.clock ?? systemDemographicAgeClock();
  const boundMs = input.boundMs ?? DEMOGRAPHIC_AGE_LOAD_BOUND_MS;
  const startedAt = clock.now();
  const deadline = clock.delay(boundMs);
  let finished = false;
  const settled = new Promise<DemographicAgeLoadStatus>((resolve) => {
    const finish = (status: DemographicAgeLoadStatus) => {
      if (finished) return;
      finished = true;
      deadline.cancel();
      resolve(status);
    };
    void input.store.getItem(demographicAgeStorageKey(input.uid)).then(
      (raw) => {
        if (!shouldApplyDemographicAgeRead(input.revisionAtStart, input.currentRevision())) {
          finish("stale");
          return;
        }
        input.onSelection(parseDemographicAgeSelection(raw));
        const late = clock.now() - startedAt >= boundMs;
        finish(late ? "timeout" : "ready");
      },
      () => {
        finish("failed");
      }
    );
    void deadline.done.then(() => {
      finish("timeout");
    });
  });
  return { settled };
}

export async function readDeviceDemographicAge(
  uid: string,
  store: Pick<DemographicAgeDeviceStore, "getItem">
): Promise<DemographicAgeSelection | null> {
  const raw = await store.getItem(demographicAgeStorageKey(uid));
  return parseDemographicAgeSelection(raw);
}

const purgeEpochByUid = new Map<string, number>();
const latestDemographicWrite = new Map<string, number>();
let demographicWriteSerial = 0;

/** Account deletion closes this owner's device band. Ordinary sign-out does not. */
export function beginDemographicAgePurge(uid: string): void {
  if (!uid) return;
  purgeEpochByUid.set(uid, (purgeEpochByUid.get(uid) ?? 0) + 1);
}

export function demographicAgePurgeEpoch(uid: string): number {
  return purgeEpochByUid.get(uid) ?? 0;
}

export async function writeDeviceDemographicAge(
  uid: string,
  selection: DemographicAgeSelection,
  store: DemographicAgeDeviceStore
): Promise<void> {
  const serial = ++demographicWriteSerial;
  latestDemographicWrite.set(uid, serial);
  const epoch = demographicAgePurgeEpoch(uid);
  const key = demographicAgeStorageKey(uid);
  // Device-only. Do not copy this into a profile patch or seal.
  await store.setItem(key, selection);
  if (latestDemographicWrite.get(uid) !== serial) return;
  if (demographicAgePurgeEpoch(uid) !== epoch) {
    await store.removeItem(key);
  }
}
