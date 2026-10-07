/**
 * Visual writing-area controls: A4 overlay + accessible steppers.
 * Percentage fields remain available as an advanced numeric path.
 */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { LocaleUiText, TextField } from "@/components/ui";
import type { LetterheadMargins } from "@/services/letterhead";
import { validateWritingMargins } from "@/services/letterhead";
import { LETTERHEAD_A4_ASPECT } from "@/services/letterhead/letterheadVisualSpec";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

const STEP = 1;
const MIN_WRITABLE = 20; // percent remaining on each axis

export interface WritingAreaControlsProps {
  margins: LetterheadMargins;
  onChange: (next: LetterheadMargins) => void;
  /** Optional background (imported image URI or custom node). */
  background?: React.ReactNode;
  labels: {
    section: string;
    top: string;
    bottom: string;
    left: string;
    right: string;
    decrease: string;
    increase: string;
  };
}

function clampAxis(
  primary: number,
  opposite: number
): { primary: number; opposite: number } {
  let p = Math.max(0, Math.min(80, primary));
  let o = Math.max(0, Math.min(80, opposite));
  if (p + o > 100 - MIN_WRITABLE) {
    o = Math.max(0, 100 - MIN_WRITABLE - p);
  }
  return { primary: p, opposite: o };
}

export function WritingAreaControls({
  margins,
  onChange,
  background,
  labels,
}: WritingAreaControlsProps) {
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      frame: {
        width: "100%",
        aspectRatio: LETTERHEAD_A4_ASPECT,
        borderRadius: radius.md,
        overflow: "hidden",
        backgroundColor: colors.surfaceMuted,
        position: "relative",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.divider,
      },
      overlay: {
        position: "absolute",
        borderWidth: 2,
        borderColor: colors.primary,
        borderStyle: "dashed",
        backgroundColor: colors.primaryLight,
        opacity: 0.45,
        borderRadius: 4,
      },
      section: {
        ...typography.captionStrong,
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: spacing.md,
        marginBottom: spacing.sm,
      },
      row: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginBottom: spacing.sm },
      label: { ...typography.caption, color: colors.text, width: 72 },
      stepper: {
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.sm,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
      },
      stepperText: { ...typography.titleMd, color: colors.text },
      value: { ...typography.captionStrong, color: colors.text, minWidth: 36, textAlign: "center" },
      advanced: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
      field: { flex: 1 },
      invalid: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
    })
  );

  const setKey = (key: keyof LetterheadMargins, raw: number) => {
    const next = { ...margins };
    if (key === "topPct") {
      const c = clampAxis(raw, margins.bottomPct);
      next.topPct = c.primary;
      next.bottomPct = c.opposite;
    } else if (key === "bottomPct") {
      const c = clampAxis(raw, margins.topPct);
      next.bottomPct = c.primary;
      next.topPct = c.opposite;
    } else if (key === "leftPct") {
      const c = clampAxis(raw, margins.rightPct);
      next.leftPct = c.primary;
      next.rightPct = c.opposite;
    } else {
      const c = clampAxis(raw, margins.leftPct);
      next.rightPct = c.primary;
      next.leftPct = c.opposite;
    }
    onChange(next);
  };

  const bounds = validateWritingMargins(margins);

  const Axis = ({
    keyName,
    label,
  }: {
    keyName: keyof LetterheadMargins;
    label: string;
  }) => (
    <View style={styles.row}>
      <LocaleUiText style={styles.label}>{label}</LocaleUiText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${labels.decrease} ${label}`}
        onPress={() => setKey(keyName, margins[keyName] - STEP)}
        style={styles.stepper}
      >
        <LocaleUiText style={styles.stepperText}>−</LocaleUiText>
      </Pressable>
      <LocaleUiText style={styles.value}>{Math.round(margins[keyName])}%</LocaleUiText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${labels.increase} ${label}`}
        onPress={() => setKey(keyName, margins[keyName] + STEP)}
        style={styles.stepper}
      >
        <LocaleUiText style={styles.stepperText}>+</LocaleUiText>
      </Pressable>
    </View>
  );

  return (
    <View>
      <View style={styles.frame} accessibilityLabel={labels.section}>
        {background}
        <View
          pointerEvents="none"
          style={[
            styles.overlay,
            {
              top: `${margins.topPct}%`,
              bottom: `${margins.bottomPct}%`,
              left: `${margins.leftPct}%`,
              right: `${margins.rightPct}%`,
            },
          ]}
        />
      </View>

      <LocaleUiText style={styles.section}>{labels.section}</LocaleUiText>
      <Axis keyName="topPct" label={labels.top} />
      <Axis keyName="bottomPct" label={labels.bottom} />
      <Axis keyName="leftPct" label={labels.left} />
      <Axis keyName="rightPct" label={labels.right} />

      {!bounds.ok ? (
        <LocaleUiText style={styles.invalid}>{labels.section}</LocaleUiText>
      ) : null}

      <View style={styles.advanced}>
        {(
          [
            ["topPct", labels.top],
            ["bottomPct", labels.bottom],
            ["leftPct", labels.left],
            ["rightPct", labels.right],
          ] as const
        ).map(([key, label]) => (
          <TextField
            key={key}
            label={label}
            keyboardType="number-pad"
            value={String(margins[key])}
            onChangeText={(raw) => {
              const cleaned = raw.replace(/[^0-9]/g, "").slice(0, 2);
              setKey(key, parseInt(cleaned || "0", 10));
            }}
            maxLength={2}
            containerStyle={styles.field}
          />
        ))}
      </View>
    </View>
  );
}
