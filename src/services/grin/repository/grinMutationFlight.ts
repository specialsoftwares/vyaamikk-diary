/**
 * Synchronous owner/attempt-bound flight for GRIN create/return handlers.
 * React busy-state alone cannot stop immediate re-entry before a rerender.
 *
 * Completed intents stay locked so navigation / confirmation cannot admit the
 * same finished submit again. Failed attempts release so unresolved work can retry.
 */

export type GrinMutationFlightOwner = symbol;

export type GrinMutationFlightState = "idle" | "in_flight" | "completed";

type FlightEntry = {
  state: GrinMutationFlightState;
  owner: GrinMutationFlightOwner;
};

const flights = new Map<string, FlightEntry>();

export function grinCreateFlightKey(ownerUid: string, ledgerId: string): string {
  return `grin:create:${ownerUid}:${ledgerId}`;
}

export function grinReturnFlightKey(ownerUid: string, ledgerId: string, receiptId: string): string {
  return `grin:return:${ownerUid}:${ledgerId}:${receiptId.trim()}`;
}

/** Acquire only from idle. Returns null when in-flight or completed. */
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

/** Release only the owning attempt. Completed stays completed unless reset. */
export function releaseGrinMutationFlight(key: string, owner: GrinMutationFlightOwner): void {
  const entry = flights.get(key);
  if (!entry || entry.owner !== owner) return;
  if (entry.state === "completed") return;
  flights.delete(key);
}

/** Test / reopen helper: clear completed so a new intent may start. */
export function resetGrinMutationFlightForTests(key?: string): void {
  if (key) flights.delete(key);
  else flights.clear();
}

export function grinMutationFlightState(key: string): GrinMutationFlightState {
  return flights.get(key)?.state ?? "idle";
}
