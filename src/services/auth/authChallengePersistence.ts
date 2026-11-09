/** Serialized mutations for a single persisted phone challenge or digit snapshot. */
export type AuthChallengeIdentity = Readonly<{ phoneE164: string; verificationId: string }>;
export type ChallengePersistencePort = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
};

export function createAuthChallengePersistence(port: ChallengePersistencePort) {
  let tail: Promise<void> = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work, work);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }
  return {
    read: () => port.read(),
    save(snapshot: AuthChallengeIdentity, isCurrent: () => boolean = () => true): Promise<void> {
      // Capture now; callers must not mutate a queued snapshot into another attempt.
      const raw = JSON.stringify(snapshot);
      return enqueue(async () => { if (isCurrent()) await port.write(raw); });
    },
    clear(expected?: AuthChallengeIdentity | null, isCurrent: () => boolean = () => true): Promise<void> {
      return enqueue(async () => {
        if (!isCurrent() || expected === null) return;
        if (expected) {
          const raw = await port.read();
          if (!isCurrent() || !raw) return;
          let value: Partial<AuthChallengeIdentity>;
          try { value = JSON.parse(raw); } catch { return; }
          if (value?.phoneE164 !== expected.phoneE164 || value?.verificationId !== expected.verificationId) return;
        }
        if (isCurrent()) await port.remove();
      });
    },
  };
}
