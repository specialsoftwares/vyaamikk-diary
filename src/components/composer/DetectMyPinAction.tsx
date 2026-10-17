import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { LocaleUiText } from "@/components/ui";
import { useVyaaflowCopy } from "@/content/vyaaflow/useVyaaflowCopy";
import { useAuth } from "@/state/auth";
import {
  acceptDetectPinTap,
  mayApplyDetectPinResult,
  type DetectPinRequest,
  type DetectPinResult,
} from "@/services/location/detectMyPin";
import { detectMyPinOnDevice } from "@/services/location/detectMyPinDevice";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

interface DetectMyPinActionProps {
  fieldKey: string;
  scopeId: string;
  fieldRevisionRef: React.MutableRefObject<number>;
  onApplyPin: (pin: string) => void;
  children: React.ReactNode;
}

type Phase = "idle" | "reason" | "working" | "confirm" | "message";

/**
 * Explicit, one-field PIN suggestion. The first control only shows the reason.
 * Location starts after Continue, and the PIN is written only after the user confirms.
 */
export function DetectMyPinAction({
  fieldKey,
  scopeId,
  fieldRevisionRef,
  onApplyPin,
  children,
}: DetectMyPinActionProps) {
  const { user } = useAuth();
  const vyaaflowCopy = useVyaaflowCopy();
  const ownerId = user?.uid ?? null;
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Extract<DetectPinResult, { kind: "proposal" }> | null>(
    null
  );
  const aliveRef = useRef(true);
  const sessionRef = useRef(1);
  const inFlightRef = useRef(false);
  const requestRef = useRef<DetectPinRequest | null>(null);
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;

  useEffect(() => {
    sessionRef.current += 1;
    aliveRef.current = true;
    inFlightRef.current = false;
    setPhase("idle");
    setProposal(null);
    setMessage(null);
    return () => {
      aliveRef.current = false;
      sessionRef.current += 1;
      inFlightRef.current = false;
    };
  }, [ownerId, fieldKey, scopeId]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
      field: { flex: 1, minWidth: 0 },
      button: {
        flexShrink: 1,
        maxWidth: "46%",
        minHeight: 44,
        minWidth: 44,
        justifyContent: "center",
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        marginBottom: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: c.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      buttonText: {
        flexShrink: 1,
        fontFamily: typography.captionStrong.fontFamily,
        fontSize: typography.captionStrong.fontSize,
        fontWeight: typography.captionStrong.fontWeight,
        color: c.primary,
        textAlign: "center",
      },
      panel: { marginTop: spacing.xs, gap: spacing.xs },
      body: {
        fontFamily: typography.caption.fontFamily,
        fontSize: typography.caption.fontSize,
        fontWeight: typography.caption.fontWeight,
        color: c.textMuted,
      },
      pin: {
        fontFamily: typography.bodyStrong.fontFamily,
        fontSize: typography.bodyStrong.fontSize,
        fontWeight: typography.bodyStrong.fontWeight,
        color: c.text,
      },
      actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
      action: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
      actionText: {
        fontFamily: typography.captionStrong.fontFamily,
        fontSize: typography.captionStrong.fontSize,
        fontWeight: typography.captionStrong.fontWeight,
        color: c.primary,
      },
    })
  );

  const readFence = () => ({
    ownerId: ownerRef.current ?? "",
    sessionGeneration: sessionRef.current,
    screenAlive: aliveRef.current,
    targetField: fieldKey,
    fieldRevision: fieldRevisionRef.current,
  });

  const showReason = () => {
    if (!ownerId || phase === "working" || phase === "reason" || phase === "confirm") return;
    setMessage(null);
    setProposal(null);
    setPhase("reason");
  };

  const dismiss = () => {
    inFlightRef.current = false;
    setProposal(null);
    setPhase("idle");
  };

  const continueDetect = () => {
    if (!ownerId) return;
    if (!acceptDetectPinTap(inFlightRef.current)) return;
    const request: DetectPinRequest = {
      ownerId,
      sessionGeneration: sessionRef.current,
      targetField: fieldKey,
      fieldRevision: fieldRevisionRef.current,
      readFence,
    };
    requestRef.current = request;
    inFlightRef.current = true;
    setPhase("working");
    setMessage(null);
    void detectMyPinOnDevice(request)
      .then((result) => {
        if (!aliveRef.current || ownerRef.current !== ownerId) return;
        if (result.kind === "proposal") {
          if (result.targetField !== fieldKey || !mayApplyDetectPinResult(request)) {
            setProposal(null);
            setMessage(
              fieldRevisionRef.current !== request.fieldRevision ? vyaaflowCopy.detectMyPin.keptManual : null
            );
            setPhase(fieldRevisionRef.current !== request.fieldRevision ? "message" : "idle");
            return;
          }
          setProposal(result);
          setPhase("confirm");
          return;
        }
        if (result.kind === "stale") {
          const kept = fieldRevisionRef.current !== request.fieldRevision;
          setMessage(kept ? vyaaflowCopy.detectMyPin.keptManual : null);
          setPhase(kept ? "message" : "idle");
          return;
        }
        if (result.kind === "denied") {
          setMessage(vyaaflowCopy.detectMyPin.denied);
          setPhase("message");
          return;
        }
        setMessage(vyaaflowCopy.detectMyPin.unavailable);
        setPhase("message");
      })
      .catch(() => {
        if (!aliveRef.current) return;
        setMessage(vyaaflowCopy.detectMyPin.unavailable);
        setPhase("message");
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  };

  const usePin = () => {
    const request = requestRef.current;
    if (!proposal || !request) return;
    if (proposal.targetField !== fieldKey || !mayApplyDetectPinResult(request)) {
      setProposal(null);
      setMessage(vyaaflowCopy.detectMyPin.keptManual);
      setPhase("message");
      return;
    }
    onApplyPin(proposal.pinCode);
    setProposal(null);
    setMessage(null);
    setPhase("idle");
  };

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.field}>{children}</View>
        <Pressable
          onPress={showReason}
          accessibilityRole="button"
          accessibilityLabel={vyaaflowCopy.detectMyPin.action}
          accessibilityHint={vyaaflowCopy.detectMyPin.reason}
          style={styles.button}
        >
          <LocaleUiText style={styles.buttonText}>{vyaaflowCopy.detectMyPin.action}</LocaleUiText>
        </Pressable>
      </View>
      {phase === "reason" ? (
        <View style={styles.panel}>
          <LocaleUiText style={styles.body}>{vyaaflowCopy.detectMyPin.reason}</LocaleUiText>
          <View style={styles.actions}>
            <Pressable onPress={continueDetect} accessibilityRole="button" style={styles.action}>
              <LocaleUiText style={styles.actionText}>{vyaaflowCopy.detectMyPin.continue}</LocaleUiText>
            </Pressable>
            <Pressable onPress={dismiss} accessibilityRole="button" style={styles.action}>
              <LocaleUiText style={styles.actionText}>{vyaaflowCopy.detectMyPin.notNow}</LocaleUiText>
            </Pressable>
          </View>
        </View>
      ) : null}
      {phase === "working" ? (
        <View style={styles.panel}>
          <ActivityIndicator size="small" />
          <LocaleUiText style={styles.body}>{vyaaflowCopy.detectMyPin.working}</LocaleUiText>
        </View>
      ) : null}
      {phase === "confirm" && proposal ? (
        <View style={styles.panel}>
          <LocaleUiText style={styles.body}>{vyaaflowCopy.detectMyPin.confirmLead}</LocaleUiText>
          <LocaleUiText style={styles.pin}>{proposal.pinCode}</LocaleUiText>
          {proposal.areaLabel ? <LocaleUiText style={styles.body}>{proposal.areaLabel}</LocaleUiText> : null}
          {proposal.approximate ? (
            <LocaleUiText style={styles.body}>{vyaaflowCopy.detectMyPin.approximateNote}</LocaleUiText>
          ) : null}
          <View style={styles.actions}>
            <Pressable onPress={usePin} accessibilityRole="button" style={styles.action}>
              <LocaleUiText style={styles.actionText}>{vyaaflowCopy.detectMyPin.usePin}</LocaleUiText>
            </Pressable>
            <Pressable onPress={dismiss} accessibilityRole="button" style={styles.action}>
              <LocaleUiText style={styles.actionText}>{vyaaflowCopy.detectMyPin.typeInstead}</LocaleUiText>
            </Pressable>
          </View>
        </View>
      ) : null}
      {phase === "message" && message ? (
        <View style={styles.panel}>
          <LocaleUiText style={styles.body}>{message}</LocaleUiText>
        </View>
      ) : null}
    </View>
  );
}
