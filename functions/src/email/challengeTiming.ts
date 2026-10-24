/**
 * Owned email-challenge spans. Durations only.
 * Provider success is request acceptance, not inbox delivery.
 */

export type EmailChallengeStage = "challenge_db" | "provider_request" | "verify_db";
export type EmailChallengeOutcome = "ok" | "error";

export interface EmailChallengeSpan {
  stage: EmailChallengeStage;
  durationMs: number;
  outcome: EmailChallengeOutcome;
}

const MAX_SPANS = 32;
const spans: EmailChallengeSpan[] = [];

export function noteEmailChallengeSpan(
  stage: EmailChallengeStage,
  durationMs: number,
  outcome: EmailChallengeOutcome
): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  spans.push({ stage, durationMs: Math.round(durationMs), outcome });
  if (spans.length > MAX_SPANS) spans.shift();
}

export function emailChallengeSpans(): readonly EmailChallengeSpan[] {
  return spans.map((span) => ({ ...span }));
}

export function resetEmailChallengeSpansForTests(): void {
  spans.length = 0;
}

export async function timeEmailChallengeSpan<T>(
  stage: EmailChallengeStage,
  run: () => Promise<T>,
  outcomeOf?: (value: T) => EmailChallengeOutcome
): Promise<T> {
  const started = Date.now();
  try {
    const value = await run();
    noteEmailChallengeSpan(
      stage,
      Date.now() - started,
      outcomeOf ? outcomeOf(value) : "ok"
    );
    return value;
  } catch (error) {
    noteEmailChallengeSpan(stage, Date.now() - started, "error");
    throw error;
  }
}
