/**
 * Ledger V mark — exact SVG geometry (viewBox 0 0 80 80).
 * Do not approximate; used verbatim for Act 3 path tracing.
 */

export const LEDGER_V_VIEWBOX = 80;

export const V_PATH_D = "M 12 11 L 40 68 L 68 11";

export const V_STROKE = {
  width: 12,
  linejoin: "miter" as const,
  miterlimit: 15,
  linecap: "square" as const,
  color: "#FFFFFF",
};

export const LEDGER_CUT = {
  x: 0,
  y: 36,
  width: 80,
  height: 5.5,
  fill: "#1E1B4B",
};

export const GOLD_RULE = {
  x1: 17.5,
  y1: 38.75,
  x2: 62.5,
  y2: 38.75,
  strokeWidth: 1.4,
  maxOpacity: 0.88,
};

export const TRACE_BAND = { yMin: 36, yMax: 41.5, midY: 38.75 };

const LEFT_DX = 28;
const LEFT_DY = 57;

/** Parametric point on left arm (t: 0 = top-left, 1 = tip). */
export function pointOnLeftArm(t: number): { x: number; y: number } {
  return { x: 12 + t * LEFT_DX, y: 11 + t * LEFT_DY };
}

/** Parametric point on right arm (t: 0 = tip, 1 = top-right). */
export function pointOnRightArm(t: number): { x: number; y: number } {
  return { x: 40 + t * LEFT_DX, y: 68 - t * LEFT_DY };
}

export function leftArmLength(): number {
  return Math.hypot(LEFT_DX, LEFT_DY);
}

export function rightArmLength(): number {
  return leftArmLength();
}

/** Global trace progress 0–1 over Act 3 (900ms): 0–0.5 left arm, 0.5–1 right arm. */
export function tracerAtProgress(p: number): { x: number; y: number; segment: "left" | "right" } {
  const clamped = Math.max(0, Math.min(1, p));
  if (clamped <= 0.5) {
    return { ...pointOnLeftArm(clamped * 2), segment: "left" };
  }
  return { ...pointOnRightArm((clamped - 0.5) * 2), segment: "right" };
}

/** Left-arm t where y crosses TRACE_BAND.midY (~24.5, 38.75). */
export function leftArmBandCrossT(): number {
  return (TRACE_BAND.midY - 11) / LEFT_DY;
}

/** Right-arm t where y crosses TRACE_BAND.midY (~55.5, 38.75). */
export function rightArmBandCrossT(): number {
  return (68 - TRACE_BAND.midY) / LEFT_DY;
}
