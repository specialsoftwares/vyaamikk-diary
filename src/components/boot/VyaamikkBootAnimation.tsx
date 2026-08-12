import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Line, Path } from "react-native-svg";

import {
  BOOT_ANIMATION_MS,
  BOOT_EXIT_BLACK_MS,
  BOOT_REVEAL_MS,
  BOOT_REDUCED_MOTION_MS,
  BRAND_SURFACE,
} from "@/config/brandMotion";
import { computeBootFrame, type BootFrame } from "@/components/boot/bootAnimationTimeline";
import { LedgerVMarkSvg } from "@/components/boot/LedgerVMarkSvg";
import { VyaamikkBootWordmark } from "@/components/boot/VyaamikkBootWordmark";

/** Dev-only: set true locally to verify label negative-space placement. */
const DEBUG_BOOT_LABEL_ZONES = false;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const MARK_BASE = 112;
const ENV_SCALE = (Math.min(SCREEN_W, SCREEN_H) / MARK_BASE) * 0.78;
const LEFT_ARM_LEN = Math.hypot(28, 57);

/** Act 4 hold scale — ~68% of Act 2 peak (acceptable 0.65–0.70). */
const ACT4_MARK_SCALE_RATIO = 0.68;
const ACT3_END_MS = 1980;
const ACT3_SHRINK_MS = 150;
const ACT3_SHRINK_START_MS = ACT3_END_MS - ACT3_SHRINK_MS;
const ACT4_HOLD_END_MS = 3050;

const WORDMARK_BLOCK_H = 47;
const CENTER_GAP = 32;

/** Connector origin — just outside protected V area at Act 4 scale. */
const CONNECTOR_START_RADIUS = 62;
const CONNECTOR_LABEL_INSET = 18;

const MICRO_LABELS = ["RECORDS", "INVOICES", "LEDGER", "GST", "PDF"] as const;

/** Offsets from mark center into V negative spaces (screen px). */
const LABEL_OFFSETS: Record<(typeof MICRO_LABELS)[number], { x: number; y: number }> = {
  RECORDS: { x: 0, y: -160 },
  INVOICES: { x: -150, y: -60 },
  LEDGER: { x: 150, y: -60 },
  GST: { x: 0, y: 140 },
  PDF: { x: 0, y: -60 },
};

const INITIAL_FRAME: BootFrame = {
  wordmarkOpacity: 0,
  markOpacity: 0,
  markScale: 1,
  tracerX: 12,
  tracerY: 11,
  tracerVisible: false,
  goldOpacity: 0,
  leftTrailLen: 0,
  rightTrailLen: 0,
  labels: [0, 0, 0, 0, 0],
  connectors: [0, 0, 0, 0, 0],
  sequenceDone: false,
};

function easeOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 3);
}

function getMarkCenter(displayMarkScale: number): { x: number; y: number } {
  const totalH = WORDMARK_BLOCK_H + CENTER_GAP + MARK_BASE * displayMarkScale;
  const groupTop = SCREEN_H / 2 - totalH / 2;
  return {
    x: SCREEN_W / 2,
    y: groupTop + WORDMARK_BLOCK_H + CENTER_GAP + (MARK_BASE * displayMarkScale) / 2,
  };
}

/** Act 4-only scale: shrink last 150ms of Act 3, hold until Act 5. */
function resolveDisplayMarkScale(timelineScale: number, ms: number, reduced: boolean): number {
  if (reduced) return timelineScale;
  const peak = ENV_SCALE;
  const act4Scale = peak * ACT4_MARK_SCALE_RATIO;
  if (ms >= ACT3_SHRINK_START_MS && ms < ACT3_END_MS) {
    const p = easeOutCubic((ms - ACT3_SHRINK_START_MS) / ACT3_SHRINK_MS);
    return peak - p * (peak - act4Scale);
  }
  if (ms >= ACT3_END_MS && ms < ACT4_HOLD_END_MS) {
    return act4Scale;
  }
  return timelineScale;
}

function viewBoxToScreen(
  vx: number,
  vy: number,
  markCenter: { x: number; y: number },
  displayMarkScale: number
): { x: number; y: number } {
  const pxPerUnit = (MARK_BASE * displayMarkScale) / 80;
  return {
    x: markCenter.x + (vx - 40) * pxPerUnit,
    y: markCenter.y + (vy - 40) * pxPerUnit,
  };
}

function connectorEndpoints(
  markCenter: { x: number; y: number },
  labelCenter: { x: number; y: number }
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = labelCenter.x - markCenter.x;
  const dy = labelCenter.y - markCenter.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= CONNECTOR_START_RADIUS + 4) return null;
  const ux = dx / dist;
  const uy = dy / dist;
  return {
    x1: markCenter.x + ux * CONNECTOR_START_RADIUS,
    y1: markCenter.y + uy * CONNECTOR_START_RADIUS,
    x2: labelCenter.x - ux * CONNECTOR_LABEL_INSET,
    y2: labelCenter.y - uy * CONNECTOR_LABEL_INSET,
  };
}

export interface VyaamikkBootAnimationProps {
  /** Parent sets true when animationDone && bootReady && routeResolved. */
  releaseToApp: boolean;
  showHoldMessage?: boolean;
  reducedMotion?: boolean;
  /** Presentation override only. Production boot omits this (uses BOOT_ANIMATION_MS). */
  sequenceDurationMs?: number;
  onAnimationDone: () => void;
  onBlackMidpoint: () => void;
  onExitComplete: () => void;
}

export function VyaamikkBootAnimation({
  releaseToApp,
  showHoldMessage = false,
  reducedMotion = false,
  sequenceDurationMs,
  onAnimationDone,
  onBlackMidpoint,
  onExitComplete,
}: VyaamikkBootAnimationProps) {
  const blackOverlay = useSharedValue(0);
  const [frame, setFrame] = useState<BootFrame>(INITIAL_FRAME);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [holdFinalFrame, setHoldFinalFrame] = useState(false);
  const phaseRef = useRef<"playing" | "holding" | "exiting">("playing");
  const exitStartedRef = useRef(false);
  const animationDoneRef = useRef(false);
  const releaseToAppRef = useRef(releaseToApp);
  releaseToAppRef.current = releaseToApp;

  const duration =
    sequenceDurationMs ?? (reducedMotion ? BOOT_REDUCED_MOTION_MS : BOOT_ANIMATION_MS);
  const frozenMs = holdFinalFrame ? duration : elapsedMs;
  const displayMarkScale = resolveDisplayMarkScale(frame.markScale, frozenMs, reducedMotion);
  const markCenter = getMarkCenter(displayMarkScale);

  const beginExit = useCallback(() => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    phaseRef.current = "exiting";
    onBlackMidpoint();
    blackOverlay.value = withTiming(
      1,
      { duration: BOOT_EXIT_BLACK_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (!finished) return;
        blackOverlay.value = withTiming(
          0,
          { duration: BOOT_REVEAL_MS, easing: Easing.out(Easing.cubic) },
          (done) => {
            if (done) runOnJS(onExitComplete)();
          }
        );
      }
    );
  }, [blackOverlay, onBlackMidpoint, onExitComplete]);

  const markSequenceComplete = useCallback(() => {
    if (animationDoneRef.current) return;
    animationDoneRef.current = true;
    phaseRef.current = "holding";
    setHoldFinalFrame(true);
    onAnimationDone();
    if (releaseToAppRef.current) {
      beginExit();
    }
  }, [beginExit, onAnimationDone]);

  useEffect(() => {
    if (!releaseToApp) return;
    // Gate may release after brand minimum while choreography is still playing.
    if (phaseRef.current === "holding" || phaseRef.current === "playing") {
      beginExit();
    }
  }, [releaseToApp, beginExit]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastTick = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const ms = Math.min(duration, now - start);
      if (now - lastTick >= 32 || ms >= duration) {
        lastTick = now;
        setElapsedMs(ms);
        const next = computeBootFrame(ms, reducedMotion, ENV_SCALE);
        setFrame(next);
        if (next.sequenceDone && phaseRef.current === "playing") {
          markSequenceComplete();
        }
      }
      if (ms < duration) {
        raf = requestAnimationFrame(tick);
      } else if (phaseRef.current === "playing") {
        markSequenceComplete();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimation(blackOverlay);
    };
  }, [blackOverlay, duration, markSequenceComplete, reducedMotion]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: blackOverlay.value,
  }));

  const leftArmA = viewBoxToScreen(12, 11, markCenter, displayMarkScale);
  const leftArmB = viewBoxToScreen(40, 68, markCenter, displayMarkScale);
  const rightArmA = viewBoxToScreen(40, 68, markCenter, displayMarkScale);
  const rightArmB = viewBoxToScreen(68, 11, markCenter, displayMarkScale);

  const showAct4Layers = !holdFinalFrame;

  return (
    <View style={styles.root} pointerEvents="auto">
      {showAct4Layers ? (
        <Svg
          pointerEvents="none"
          width={SCREEN_W}
          height={SCREEN_H}
          style={StyleSheet.absoluteFill}
        >
          {DEBUG_BOOT_LABEL_ZONES ? (
            <>
              <Circle
                cx={markCenter.x}
                cy={markCenter.y}
                r={CONNECTOR_START_RADIUS}
                fill="rgba(129,140,248,0.12)"
                stroke="rgba(129,140,248,0.35)"
                strokeWidth={1}
              />
              <Path
                d={`M ${leftArmA.x} ${leftArmA.y} L ${leftArmB.x} ${leftArmB.y}`}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={3}
              />
              <Path
                d={`M ${rightArmA.x} ${rightArmA.y} L ${rightArmB.x} ${rightArmB.y}`}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={3}
              />
            </>
          ) : null}

          {MICRO_LABELS.map((label, i) => {
            const opacity = frame.connectors[i];
            if (opacity <= 0.01) return null;
            const offset = LABEL_OFFSETS[label];
            const labelCenter = {
              x: markCenter.x + offset.x,
              y: markCenter.y + offset.y,
            };
            const line = connectorEndpoints(markCenter, labelCenter);
            if (!line) return null;
            return (
              <Line
                key={`line-${label}`}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
                opacity={opacity}
              />
            );
          })}
        </Svg>
      ) : null}

      <View style={styles.center}>
        <VyaamikkBootWordmark opacity={frame.wordmarkOpacity} />
        <View
          style={[
            styles.markWrap,
            {
              opacity: frame.markOpacity,
              transform: [{ scale: displayMarkScale }],
            },
          ]}
        >
          <LedgerVMarkSvg
            size={MARK_BASE}
            tracerX={frame.tracerX}
            tracerY={frame.tracerY}
            tracerVisible={holdFinalFrame ? false : frame.tracerVisible}
            goldOpacity={holdFinalFrame ? 0.88 : frame.goldOpacity}
            leftTrailLen={holdFinalFrame ? 0 : frame.leftTrailLen}
            rightTrailLen={holdFinalFrame ? 0 : frame.rightTrailLen}
            leftArmLen={LEFT_ARM_LEN}
          />
        </View>
      </View>

      {showAct4Layers
        ? MICRO_LABELS.map((label, i) => {
            const opacity = frame.labels[i];
            if (opacity <= 0.01) return null;
            const offset = LABEL_OFFSETS[label];
            const labelCenter = {
              x: markCenter.x + offset.x,
              y: markCenter.y + offset.y,
            };
            const lift = (1 - opacity / 0.88) * 6;
            return (
              <Text
                key={label}
                pointerEvents="none"
                style={[
                  styles.microLabelText,
                  {
                    left: labelCenter.x - 40,
                    top: labelCenter.y - 6 + lift,
                    opacity,
                  },
                ]}
              >
                {label}
              </Text>
            );
          })
        : null}

      {showHoldMessage ? (
        <Text style={styles.holdMessage} pointerEvents="none">
          Preparing your workspace…
        </Text>
      ) : null}

      <Animated.View style={[styles.blackout, overlayStyle]} pointerEvents="none" />
    </View>
  );
}

/** Reads system reduced-motion preference once at boot. */
export function useBootReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_SURFACE,
    zIndex: 100,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  markWrap: {
    width: MARK_BASE,
    height: MARK_BASE,
  },
  microLabelText: {
    position: "absolute",
    width: 80,
    textAlign: "center",
    fontFamily: "BarlowCondensed_700Bold",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 4,
    color: "rgba(255,255,255,0.72)",
    textShadowColor: "rgba(129,140,248,0.4)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  holdMessage: {
    position: "absolute",
    bottom: 56,
    alignSelf: "center",
    width: SCREEN_W,
    textAlign: "center",
    fontFamily: "Barlow_300Light",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.3,
  },
  blackout: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
  },
});
