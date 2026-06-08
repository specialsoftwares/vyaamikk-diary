import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Gentle fade-in — disabled when reduce motion is enabled. */
export function useLandingFadeIn(delayMs = 0): { opacity: number } {
  const [opacity, setOpacity] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduced) {
      setOpacity(1);
      return;
    }
    const start = setTimeout(() => {
      setOpacity(1);
    }, delayMs);
    return () => clearTimeout(start);
  }, [delayMs, reduced]);

  return { opacity: reduced ? 1 : opacity };
}

/** Subtle floating motion for dashboard preview — optional, reduced-motion safe. */
export function useLandingFloat(enabled: boolean): { translateY: number } {
  const [offset, setOffset] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    let reduced = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduced = v;
      if (v || !mounted) return;
      const start = performance.now();
      const tick = (now: number) => {
        if (!mounted) return;
        const t = (now - start) / 1000;
        setOffset(Math.sin(t * 0.8) * 4);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    });
    return () => {
      mounted = false;
      cancelAnimationFrame(raf.current);
    };
  }, [enabled]);

  return { translateY: offset };
}
