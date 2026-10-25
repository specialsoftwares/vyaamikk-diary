/**
 * One in-flight JS auth bridge per native uid and session generation.
 * Concurrent callers share that promise. A later generation starts its own.
 */

export type SharedBridgeKey = {
  uid: string;
  generation: number;
};

type InflightBridge = {
  key: SharedBridgeKey;
  promise: Promise<boolean>;
};

export function createSharedBridgeRunner() {
  let inflight: InflightBridge | null = null;

  return function startSharedAuthBridge(
    key: SharedBridgeKey,
    run: () => Promise<boolean>
  ): Promise<boolean> {
    if (
      inflight &&
      inflight.key.uid === key.uid &&
      inflight.key.generation === key.generation
    ) {
      return inflight.promise;
    }
    const promise = Promise.resolve()
      .then(run)
      .then((ok) => ok === true)
      .catch(() => false);
    const attempt: InflightBridge = { key, promise };
    inflight = attempt;
    void promise.finally(() => {
      if (inflight === attempt) inflight = null;
    });
    return promise;
  };
}

export const startSharedAuthBridge = createSharedBridgeRunner();
