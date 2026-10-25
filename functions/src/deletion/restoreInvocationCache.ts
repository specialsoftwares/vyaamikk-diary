/**
 * Remembers one restore-fence read for a single callable invocation.
 * The caller owns the slot. It must not be reused across requests.
 */

export type InvocationRead<T> = {
  value?: T;
  pending?: Promise<T>;
};

export type RestoreFenceRead =
  | { ok: true; closed: boolean; reconciled: boolean; localWatermark: number | null }
  | { ok: false };

export type InvocationRestoreReads = {
  fence?: InvocationRead<RestoreFenceRead>;
};

export function rememberInvocationValue<T>(
  slot: InvocationRead<T>,
  load: () => Promise<T>
): Promise<T> {
  if (slot.value !== undefined) return Promise.resolve(slot.value);
  if (slot.pending) return slot.pending;
  const pending = load().then(
    (value) => {
      slot.value = value;
      return value;
    },
    (error: unknown) => {
      if (slot.pending === pending) slot.pending = undefined;
      throw error;
    }
  );
  slot.pending = pending;
  return pending;
}
