/**
 * LetterheadPreview — lightweight, in-app visual approximation of the
 * letterhead PDF. Renders the uploaded template image at A4 aspect ratio and
 * overlays the composed matter inside the configured writable area.
 *
 * This is a *preview-like confirmation* (acceptance criterion #8), not a
 * pixel-perfect render — the final PDF uses the exact template and margins.
 * Memoized so typing in the form doesn't thrash the image layer.
 */

import React, { memo, useMemo } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Image, StyleSheet, Text, View } from "react-native";

import type { LetterheadConfig, LetterheadDocumentInput } from "@/services/letterhead";
import { useT } from "@/i18n";
import { radius, typography, useThemedStyles } from "@/theme";
import { formatShortDate } from "@/utils/date";

export interface LetterheadPreviewProps {
  config: LetterheadConfig;
  input: LetterheadDocumentInput;
}

export const LetterheadPreview = memo(function LetterheadPreview({
  config,
  input,
}: LetterheadPreviewProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      frame: {
        width: "100%",
        aspectRatio: 210 / 297,
        borderRadius: radius.md,
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        position: "relative",
      },
      bg: { width: "100%", height: "100%" },
      writable: {
        position: "absolute",
        overflow: "hidden",
      },
      dateRow: { fontSize: 7, color: "#5C5F7A", textAlign: "right" },
      reference: { fontSize: 7, color: "#5C5F7A", marginTop: 2 },
      recipient: { fontSize: 7.5, color: "#0F1226", marginTop: 4 },
      subject: { fontSize: 8, color: "#0F1226", fontWeight: "700", marginTop: 4 },
      salutation: { fontSize: 7.5, color: "#0F1226", marginTop: 4 },
      body: { fontSize: 7.5, color: "#0F1226", marginTop: 4, lineHeight: 10 },
      closing: { fontSize: 7.5, color: "#0F1226", marginTop: 6 },
      signer: { fontSize: 7.5, color: "#0F1226", fontWeight: "700", marginTop: 4 },
      signerRole: { fontSize: 7, color: "#5C5F7A" },
      hint: { ...typography.caption, color: c.textSubtle, marginTop: 8 },
    })
  );

  const recipientText = useMemo(
    () =>
      [
        input.recipientName,
        input.recipientDesignation,
        input.recipientCompany,
        input.recipientAddress,
      ]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join("\n"),
    [
      input.recipientName,
      input.recipientDesignation,
      input.recipientCompany,
      input.recipientAddress,
    ]
  );

  const writableStyle = {
    top: `${config.margins.topPct}%` as const,
    bottom: `${config.margins.bottomPct}%` as const,
    left: `${config.margins.leftPct}%` as const,
    right: `${config.margins.rightPct}%` as const,
  };

  return (
    <View>
      <View style={styles.frame}>
        {config.imageDataUri ? (
          <Image
            source={{ uri: config.imageDataUri }}
            style={styles.bg}
            resizeMode="stretch"
          />
        ) : null}
        <View pointerEvents="none" style={[styles.writable, writableStyle]}>
          <Text style={styles.dateRow}>
            {t("letterhead.labels.date")}: {formatShortDate(input.date)}
            {input.place?.trim() ? `  ·  ${input.place.trim()}` : ""}
          </Text>
          {input.reference?.trim() ? (
            <Text style={styles.reference}>
              {t("letterhead.labels.reference")}: {input.reference.trim()}
            </Text>
          ) : null}
          {recipientText ? (
            <Text style={styles.recipient}>{recipientText}</Text>
          ) : null}
          {input.subject?.trim() ? (
            <Text style={styles.subject}>
              {t("letterhead.labels.subject")}: {input.subject.trim()}
            </Text>
          ) : null}
          {input.salutation?.trim() ? (
            <Text style={styles.salutation}>{input.salutation.trim()}</Text>
          ) : null}
          {input.body?.trim() ? (
            <Text style={styles.body} numberOfLines={12}>
              {input.body.trim()}
            </Text>
          ) : null}
          {input.closing?.trim() ? (
            <Text style={styles.closing}>{input.closing.trim()}</Text>
          ) : null}
          {input.name?.trim() ? (
            <Text style={styles.signer}>{input.name.trim()}</Text>
          ) : null}
          {input.designation?.trim() ? (
            <Text style={styles.signerRole}>{input.designation.trim()}</Text>
          ) : null}
        </View>
      </View>
      <LocaleUiText style={styles.hint}>{t("letterhead.previewHint")}</LocaleUiText>
    </View>
  );
});
