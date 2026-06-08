import { useEffect, useState } from "react";

const DEFAULT_SLOW_MS = 6500;

/** True when `loading` has persisted longer than the threshold (default 6.5s). */
export function useLoadingSlowWarning(
  loading: boolean,
  slowAfterMs: number = DEFAULT_SLOW_MS
): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    setSlow(false);
    const id = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(id);
  }, [loading, slowAfterMs]);

  return slow;
}

export const SKELETON_SLOW_MS = DEFAULT_SLOW_MS;
