import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { remainingSecondsUntil } from "@/utils/otpCountdownFormat";

/** Shared tick helper for any authoritative future timestamp. */
export function useAuthoritativeCountdown(targetAtMs: number | null): number {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    targetAtMs == null ? 0 : remainingSecondsUntil(targetAtMs)
  );
  const targetRef = useRef(targetAtMs);
  targetRef.current = targetAtMs;

  useEffect(() => {
    if (targetAtMs == null) {
      setRemainingSeconds(0);
      return;
    }
    const tick = (): number => {
      const target = targetRef.current;
      const next = target == null ? 0 : remainingSecondsUntil(target);
      setRemainingSeconds(next);
      return next;
    };
    if (tick() <= 0) return;
    const id = setInterval(() => {
      if (tick() <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetAtMs]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next !== "active") return;
      const target = targetRef.current;
      setRemainingSeconds(target == null ? 0 : remainingSecondsUntil(target));
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, []);

  return remainingSeconds;
}

export function useAuthoritativeResendCountdown(resendAvailableAt: number | null): {
  remainingSeconds: number;
  canResend: boolean;
} {
  const remainingSeconds = useAuthoritativeCountdown(resendAvailableAt);
  return {
    remainingSeconds,
    canResend: remainingSeconds <= 0 && resendAvailableAt != null,
  };
}
