/**
 * DEV-ONLY onboarding timing marks. No PII, OTP digits, phones, emails, or images.
 */

const marks = new Map<string, number>();

function enabled(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

export function onboardingMark(name: string): void {
  if (!enabled()) return;
  marks.set(name, globalThis.performance?.now?.() ?? Date.now());
}

export function onboardingMeasure(start: string, end: string, label: string): number | null {
  if (!enabled()) return null;
  const a = marks.get(start);
  const b = marks.get(end) ?? (globalThis.performance?.now?.() ?? Date.now());
  if (a == null) return null;
  const ms = Math.round(b - a);
  console.log(`[onboarding-perf] ${label}=${ms}ms`);
  return ms;
}

export function __resetOnboardingPerfForTests(): void {
  marks.clear();
}
