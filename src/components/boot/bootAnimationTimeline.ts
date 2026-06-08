import { BOOT_ANIMATION_MS, BOOT_REDUCED_MOTION_MS } from "@/config/brandMotion";

const LEFT_ARM_LEN = Math.hypot(28, 57);

export interface BootFrame {
  wordmarkOpacity: number;
  markOpacity: number;
  markScale: number;
  tracerX: number;
  tracerY: number;
  tracerVisible: boolean;
  goldOpacity: number;
  leftTrailLen: number;
  rightTrailLen: number;
  labels: [number, number, number, number, number];
  connectors: [number, number, number, number, number];
  sequenceDone: boolean;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Editorial ease-out — no bounce. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

/** Controlled deceleration (approx. damping 28 / stiffness 260 feel). */
function easeOutExpo(t: number): number {
  const x = clamp01(t);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

function tracerFromProgress(p: number): { x: number; y: number } {
  const clamped = clamp01(p);
  if (clamped <= 0.5) {
    const u = clamped * 2;
    return { x: 12 + u * 28, y: 11 + u * 57 };
  }
  const u = (clamped - 0.5) * 2;
  return { x: 40 + u * 28, y: 68 - u * 57 };
}

export function computeBootFrame(
  ms: number,
  reduced: boolean,
  envScale: number
): BootFrame {
  const labels: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const connectors: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  if (reduced) {
    return {
      wordmarkOpacity: easeOutCubic(ms / 400),
      markOpacity: easeOutCubic(Math.max(0, (ms - 120) / 350)),
      markScale: 1,
      tracerX: 40,
      tracerY: 68,
      tracerVisible: false,
      goldOpacity: 0,
      leftTrailLen: 0,
      rightTrailLen: 0,
      labels,
      connectors,
      sequenceDone: ms >= BOOT_REDUCED_MOTION_MS,
    };
  }

  // Act 1 — wordmark then mark (staggered for clarity)
  const wordmarkOpacity = easeOutCubic(ms / 420);
  const markOpacity =
    ms < 140 ? 0 : ms < 580 ? easeOutCubic((ms - 140) / 440) : 1;

  // Act 2 — scale to environmental mark
  let markScale = 1;
  if (ms >= 580 && ms < 1080) {
    markScale = 1 + easeOutExpo((ms - 580) / 500) * (envScale - 1);
  } else if (ms >= 1080 && ms < 3050) {
    markScale = envScale;
  } else if (ms >= 3050 && ms < 3350) {
    markScale = envScale - easeOutExpo((ms - 3050) / 300) * (envScale - 1);
  }

  let tracerX = 12;
  let tracerY = 11;
  let tracerVisible = false;
  let goldOpacity = 0;
  let leftTrailLen = 0;
  let rightTrailLen = 0;

  // Act 3 — path trace 1080–1980ms
  if (ms >= 1080 && ms < 2750) {
    const traceP = ms < 1980 ? clamp01((ms - 1080) / 900) : 1;
    const pos = tracerFromProgress(traceP);
    tracerX = pos.x;
    tracerY = pos.y;
    tracerVisible = ms < 2750;
    if (traceP <= 0.5) {
      leftTrailLen = LEFT_ARM_LEN * (traceP * 2);
    } else {
      leftTrailLen = LEFT_ARM_LEN;
      rightTrailLen = LEFT_ARM_LEN * ((traceP - 0.5) * 2);
    }
    if (pos.y >= 36 && pos.y <= 41.5) {
      goldOpacity = easeOutCubic(clamp01((ms - 1080) / 200)) * 0.88;
    }
    if (traceP >= 0.5) {
      goldOpacity = 0.88;
    }
  } else if (ms >= 2750 && ms < 3050) {
    goldOpacity = 0.88;
  }

  // Act 4 — micro labels 1980–2780ms
  if (ms >= 1980 && ms < 2780) {
    for (let i = 0; i < 5; i += 1) {
      const start = 1980 + i * 100;
      const lift = easeOutCubic(clamp01((ms - start) / 240));
      labels[i] = lift * 0.88;
      connectors[i] = lift * 0.14;
    }
  } else if (ms >= 2780 && ms < 3180) {
    for (let i = 0; i < 5; i += 1) {
      const end = 3180 - i * 80;
      const fade = ms < end ? 0.88 : clamp01((end + 100 - ms) / 100) * 0.88;
      labels[i] = Math.max(0, fade);
      connectors[i] = labels[i] * (0.14 / 0.88);
    }
  }

  return {
    wordmarkOpacity,
    markOpacity,
    markScale,
    tracerX,
    tracerY,
    tracerVisible,
    goldOpacity,
    leftTrailLen,
    rightTrailLen,
    labels,
    connectors,
    sequenceDone: ms >= BOOT_ANIMATION_MS,
  };
}
