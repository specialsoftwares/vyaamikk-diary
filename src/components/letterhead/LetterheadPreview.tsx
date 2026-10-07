/**
 * LetterheadPreview — in-app confirmation using the same geometry/appearance
 * spec as the PDF (`letterheadVisualSpec`). Not a pixel-perfect print engine.
 */

import React, { memo, useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import type { LetterheadConfig, LetterheadDocumentInput } from "@/services/letterhead";
import {
  generatedHeaderFlex,
  IMPORTED_PAGE_FIT,
  LETTERHEAD_A4_ASPECT,
} from "@/services/letterhead/letterheadVisualSpec";
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
        aspectRatio: LETTERHEAD_A4_ASPECT,
        borderRadius: radius.md,
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        position: "relative",
      },
      bg: { width: "100%", height: "100%" },
      writable: { position: "absolute", overflow: "hidden" },
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
      genPad: { position: "absolute", top: 8, left: 10, right: 10, gap: 6 },
      genName: { fontSize: 9, fontWeight: "700", color: "#0F1226" },
      genLine: { fontSize: 7, color: "#5C5F7A" },
      appearanceNote: { fontSize: 6, color: "#5C5F7A", marginTop: 2 },
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

  const generated = config.generatedLayout;
  const isGenerated =
    config.sourceType === "generated_layout" && Boolean(generated);
  const headerFlex = generated ? generatedHeaderFlex(generated.logoAlign) : null;
  const appearanceNeedsPdf =
    generated?.appearance === "grayscale" || generated?.appearance === "mono";

  return (
    <View>
      <View style={styles.frame}>
        {isGenerated && generated && headerFlex ? (
          <View
            style={[
              styles.genPad,
              {
                flexDirection: headerFlex.flexDirection,
                justifyContent: headerFlex.justifyContent,
                alignItems: headerFlex.alignItems,
              },
            ]}
          >
            {generated.logoUri &&
            (generated.logoUri.startsWith("data:") ||
              generated.logoUri.startsWith("http")) ? (
              <Image
                source={{ uri: generated.logoUri }}
                style={{ width: 48, height: 32 }}
                resizeMode="contain"
              />
            ) : null}
            <View style={{ alignItems: headerFlex.alignItems }}>
              {generated.businessName ? (
                <Text style={[styles.genName, { textAlign: headerFlex.textAlign }]}>
                  {generated.businessName}
                </Text>
              ) : null}
              {generated.address ? (
                <Text style={[styles.genLine, { textAlign: headerFlex.textAlign }]}>
                  {generated.address}
                </Text>
              ) : null}
              {generated.contact ? (
                <Text style={[styles.genLine, { textAlign: headerFlex.textAlign }]}>
                  {generated.contact}
                </Text>
              ) : null}
              {generated.gstin ? (
                <Text style={[styles.genLine, { textAlign: headerFlex.textAlign }]}>
                  GSTIN: {generated.gstin}
                </Text>
              ) : null}
              {appearanceNeedsPdf ? (
                <Text style={styles.appearanceNote}>
                  {generated.appearance === "mono" ? "B&W" : "Grayscale"} (PDF)
                </Text>
              ) : null}
            </View>
          </View>
        ) : config.imageDataUri ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-start" }}>
            <Image
              source={{ uri: config.imageDataUri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode={IMPORTED_PAGE_FIT}
            />
          </View>
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
          {recipientText ? <Text style={styles.recipient}>{recipientText}</Text> : null}
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
