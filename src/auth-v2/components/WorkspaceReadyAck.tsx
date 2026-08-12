import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import {
  AUTH_ACTION_ZONE_ABOVE,
  AUTH_ACTION_ZONE_BELOW,
} from "@/auth-v2/components/authActionZoneLayout";
import {
  canAdvancePreparingToReady,
  canAdvanceReadyToYou,
  workspacePreparingMinVisibleMs,
  workspaceReadyMinVisibleMs,
  WORKSPACE_PREPARING_STATUS_PENDING,
  WORKSPACE_PREPARING_SUBTITLE,
  WORKSPACE_PREPARING_TITLE,
  WORKSPACE_READY_SUBTITLE,
  WORKSPACE_READY_TITLE,
  type WorkspacePersistStatus,
} from "@/auth-v2/workspaceCompletionMachine";
import { typography } from "@/theme";

export type WorkspaceReadyVisualPhase = "preparing" | "ready";

interface WorkspaceReadyAckProps {
  /** Authoritative completion status from the Review confirm path. */
  persistStatus: WorkspacePersistStatus;
  reducedMotion?: boolean;
  /** Exactly-once You navigation — only after ready paints + settle. */
  onDone: () => void;
}

function workspaceReadyLog(event: string, extra?: Record<string, unknown>) {
  if (!__DEV__) return;
  console.log(`[workspace-ready] ${event}`, {
    t: Date.now(),
    ...extra,
  });
}

/**
 * Paint-gated post-profile workspace preparation overlay.
 * Timing starts from onLayout of each visual phase — not from Confirm press.
 * Does not invent fake progress; status line reflects real pending persist only.
 */
export function WorkspaceReadyAck({
  persistStatus,
  reducedMotion = false,
  onDone,
}: WorkspaceReadyAckProps) {
  const [visualPhase, setVisualPhase] = useState<WorkspaceReadyVisualPhase>("preparing");
  const preparingPaintedAtRef = useRef<number | null>(null);
  const readyPaintedAtRef = useRef<number | null>(null);
  const navigatedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const announcedPreparing = useRef(false);
  const announcedReady = useRef(false);
  const pulse = useSharedValue(0.35);

  const preparingMin = workspacePreparingMinVisibleMs(reducedMotion);
  const readyMin = workspaceReadyMinVisibleMs(reducedMotion);

  useEffect(() => {
    workspaceReadyLog("mounted", { persistStatus });
    // Mount provenance only — do not re-log on every persistStatus flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional once-on-mount
  }, []);

  useEffect(() => {
    if (reducedMotion || visualPhase !== "preparing") {
      pulse.value = 0.85;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [visualPhase, pulse, reducedMotion]);

  useEffect(() => {
    if (visualPhase !== "preparing" || announcedPreparing.current) return;
    announcedPreparing.current = true;
    AccessibilityInfo.announceForAccessibility(WORKSPACE_PREPARING_TITLE);
  }, [visualPhase]);

  useEffect(() => {
    if (visualPhase !== "ready" || announcedReady.current) return;
    announcedReady.current = true;
    AccessibilityInfo.announceForAccessibility(WORKSPACE_READY_TITLE);
  }, [visualPhase]);

  // Advance preparing → ready only after paint + persist success + min visible.
  useEffect(() => {
    if (visualPhase !== "preparing") return;
    const tick = () => {
      const now = Date.now();
      if (
        !canAdvancePreparingToReady({
          persistStatus,
          preparingPaintedAt: preparingPaintedAtRef.current,
          now,
          minVisibleMs: preparingMin,
        })
      ) {
        return;
      }
      workspaceReadyLog("ready transition scheduled", {
        paintedAt: preparingPaintedAtRef.current,
        persistStatus,
      });
      setVisualPhase("ready");
    };
    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [persistStatus, preparingMin, visualPhase]);

  // Navigate ready → you only after ready paint + settle.
  useEffect(() => {
    if (visualPhase !== "ready") return;
    const tick = () => {
      const now = Date.now();
      if (
        !canAdvanceReadyToYou({
          readyPaintedAt: readyPaintedAtRef.current,
          now,
          minVisibleMs: readyMin,
          alreadyNavigated: navigatedRef.current,
        })
      ) {
        return;
      }
      navigatedRef.current = true;
      workspaceReadyLog("navigating to you", {
        paintedAt: readyPaintedAtRef.current,
      });
      onDoneRef.current();
    };
    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [readyMin, visualPhase]);

  const onPreparingLayout = useCallback(() => {
    if (preparingPaintedAtRef.current != null) return;
    preparingPaintedAtRef.current = Date.now();
    workspaceReadyLog("preparing rendered", {
      persistStatus,
    });
    workspaceReadyLog("setting_up rendered", { alias: "preparing" });
  }, [persistStatus]);

  const onReadyLayout = useCallback(() => {
    if (readyPaintedAtRef.current != null) return;
    readyPaintedAtRef.current = Date.now();
    workspaceReadyLog("ready rendered", {});
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.92 + pulse.value * 0.08 }],
  }));

  return (
    <View
      style={styles.root}
      accessibilityRole="alert"
      testID={`workspace-ready-ack-${visualPhase}`}
      collapsable={false}
    >
      <View style={styles.zoneAbove} />
      <View style={styles.cluster} collapsable={false}>
        {visualPhase === "preparing" ? (
          <View
            testID="workspace-ready-preparing"
            onLayout={onPreparingLayout}
            collapsable={false}
            style={styles.phaseBlock}
          >
            <Animated.View style={[styles.ring, ringStyle]} />
            <Text style={styles.label}>{WORKSPACE_PREPARING_TITLE}</Text>
            <Text style={styles.sub}>{WORKSPACE_PREPARING_SUBTITLE}</Text>
            {persistStatus === "pending" ? (
              <Text style={styles.status}>{WORKSPACE_PREPARING_STATUS_PENDING}</Text>
            ) : null}
          </View>
        ) : (
          <View
            testID="workspace-ready-success"
            onLayout={onReadyLayout}
            collapsable={false}
            style={styles.phaseBlock}
          >
            <Text style={styles.mark}>✓</Text>
            <Text style={styles.label}>{WORKSPACE_READY_TITLE}</Text>
            <Text style={styles.sub}>{WORKSPACE_READY_SUBTITLE}</Text>
          </View>
        )}
      </View>
      <View style={styles.zoneBelow} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#12152E",
    zIndex: 40,
    elevation: 40,
  },
  zoneAbove: {
    flexGrow: AUTH_ACTION_ZONE_ABOVE,
    flexShrink: 1,
    flexBasis: 0,
  },
  zoneBelow: {
    flexGrow: AUTH_ACTION_ZONE_BELOW,
    flexShrink: 1,
    flexBasis: 0,
  },
  cluster: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  phaseBlock: {
    alignItems: "center",
    gap: 12,
    maxWidth: 340,
  },
  ring: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "#A5B4FC",
  },
  mark: {
    color: "#A5B4FC",
    fontSize: 36,
    fontWeight: "700",
  },
  label: {
    ...typography.titleMd,
    color: "#FFFFFF",
    textAlign: "center",
  },
  sub: {
    ...typography.body,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  status: {
    ...typography.captionStrong,
    color: "#A5B4FC",
    textAlign: "center",
    marginTop: 4,
  },
});
