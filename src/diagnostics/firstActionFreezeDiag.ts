/**
 * Optional correlated milestones for post-login first-action freeze diagnosis.
 * Enabled only when __DEV__ and EXPO_PUBLIC_DEBUG_FIRST_ACTION_FREEZE=1.
 * Never logs PII (no phone, email, or profile payloads).
 */

let correlationId: string | null = null;
let sessionStartedAt = 0;
let seq = 0;

function enabled(): boolean {
  return (
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_DEBUG_FIRST_ACTION_FREEZE === "1"
  );
}

function nextId(): string {
  return `faf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function beginFirstActionFreezeSession(reason: string): string | null {
  if (!enabled()) return null;
  correlationId = nextId();
  sessionStartedAt = Date.now();
  seq = 0;
  markFirstActionFreeze("session_begin", { reason });
  return correlationId;
}

export function markFirstActionFreeze(
  milestone: string,
  extra?: Record<string, string | number | boolean | null | undefined>
): void {
  if (!enabled() || !correlationId) return;
  seq += 1;
  const elapsedMs = Date.now() - sessionStartedAt;
  // Structured one-liner — safe for Metro; no user content.
  console.log(
    `[first-action-freeze] ${JSON.stringify({
      id: correlationId,
      seq,
      elapsedMs,
      milestone,
      ...extra,
    })}`
  );
}

export function endFirstActionFreezeSession(): void {
  if (!enabled()) return;
  markFirstActionFreeze("session_end");
  correlationId = null;
  sessionStartedAt = 0;
  seq = 0;
}
