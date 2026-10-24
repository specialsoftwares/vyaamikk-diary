/**
 * Synchronous submission-intent flight.
 * Duplicate prevention is bound to one intent id + owner + session generation.
 * A completed intent stays completed so a stale callback cannot submit it again.
 * A new receipt or a later return uses a new intent id. Rerender does not reset locks.
 */

export type GrinMutationFlightOwner = symbol;

export type GrinMutationFlightState = "idle" | "in_flight" | "completed";

type FlightEntry = {
  state: GrinMutationFlightState;
  owner: GrinMutationFlightOwner;
};

const flights = new Map<string, FlightEntry>();

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function mintSubmissionIntentId(): string {
  let out = "gint_";
  for (let i = 0; i < 16; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!;
  }
  return out;
}

export function grinCreateFlightKey(
  ownerUid: string,
  ledgerId: string,
  intentId: string,
  sessionGeneration: number
): string {
  return `grin:create:${ownerUid}:${ledgerId}:${sessionGeneration}:${intentId}`;
}

export function grinReturnFlightKey(
  ownerUid: string,
  ledgerId: string,
  receiptId: string,
  intentId: string,
  sessionGeneration: number
): string {
  return `grin:return:${ownerUid}:${ledgerId}:${receiptId.trim()}:${sessionGeneration}:${intentId}`;
}

/** Acquire only from idle. Returns null when this intent is in-flight or already completed. */
export function acquireGrinMutationFlight(key: string): GrinMutationFlightOwner | null {
  if (!key) return null;
  const existing = flights.get(key);
  if (existing && existing.state !== "idle") return null;
  const owner = Symbol(key);
  flights.set(key, { state: "in_flight", owner });
  return owner;
}

export function markGrinMutationFlightCompleted(key: string, owner: GrinMutationFlightOwner): void {
  const entry = flights.get(key);
  if (!entry || entry.owner !== owner) return;
  entry.state = "completed";
}

/** Release only an in-flight attempt owned by this caller. Completed intents stay completed. */
export function releaseGrinMutationFlight(key: string, owner: GrinMutationFlightOwner): void {
  const entry = flights.get(key);
  if (!entry || entry.owner !== owner) return;
  if (entry.state === "completed") return;
  flights.delete(key);
}

export function resetGrinMutationFlightForTests(key?: string): void {
  if (key) flights.delete(key);
  else flights.clear();
}

export function grinMutationFlightState(key: string): GrinMutationFlightState {
  return flights.get(key)?.state ?? "idle";
}
