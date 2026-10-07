/**
 * Create letterhead from business profile logo + selected details.
 * Three restrained layouts (logo left / centre / right). Fields are optional
 * and snapshotted at save — live profile edits do not rewrite finalized letters.
 */

import React, { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";

import {
  Banner,
  Button,
  Card,
  Header,
  LocaleUiText,
  Screen,
  TextField,
} from "@/components/ui";
import { useAuth } from "@/state/auth";
import {
  DEFAULT_LETTERHEAD_MARGINS,
  getLetterheadRepository,
  type LetterheadAppearance,
  type LetterheadGeneratedLayout,
  type LetterheadLogoAlign,
  validateWritingMargins,
} from "@/services/letterhead";
import { readProfileLogoDataUri } from "@/services/profileLogo/storage";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

const ALIGNS: LetterheadLogoAlign[] = ["left", "center", "right"];
const APPEARANCES: LetterheadAppearance[] = ["original", "color", "grayscale", "mono"];

function buildAddress(user: NonNullable<ReturnType<typeof useAuth>["user"]>): string | null {
  const parts = [
    user.pinLocality?.trim(),
    user.pinDistrict?.trim(),
    user.pinState?.trim(),
    user.pinCode?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function buildContact(user: NonNullable<ReturnType<typeof useAuth>["user"]>): string | null {
  const parts = [user.phoneE164?.trim(), user.businessEmail?.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export default function LetterheadGenerateScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
      card: { gap: spacing.md, padding: spacing.md },
      row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
      chip: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.divider,
        backgroundColor: colors.surfaceMuted,
      },
      chipOn: {
        borderColor: colors.primary,
        backgroundColor: colors.primaryLight,
      },
      chipText: { ...typography.captionStrong, color: colors.text },
      preview: {
        width: "100%",
        aspectRatio: 210 / 297,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.divider,
        backgroundColor: "#FFFFFF",
        padding: spacing.md,
      },
      previewHeader: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
      previewHeaderCenter: { flexDirection: "column", alignItems: "center" },
      previewHeaderRight: { flexDirection: "row-reverse" },
      logo: { width: 72, height: 48 },
      name: { ...typography.titleMd, color: "#0F1226" },
      line: { ...typography.caption, color: "#5C5F7A" },
      sample: {
        marginTop: spacing.xl,
        ...typography.caption,
        color: "#5C5F7A",
        fontStyle: "italic",
      },
      toggleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
      },
      cta: { marginTop: spacing.lg, gap: spacing.sm },
      section: {
        ...typography.captionStrong,
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: spacing.md,
      },
    })
  );

  const baseline = useMemo(() => {
    if (!user) {
      return {
        businessName: null as string | null,
        address: null as string | null,
        contact: null as string | null,
        gstin: null as string | null,
        logoUri: null as string | null,
      };
    }
    return {
      businessName: user.businessName?.trim() || user.displayName?.trim() || null,
      address: buildAddress(user),
      contact: buildContact(user),
      gstin: user.gstin?.trim() || null,
      logoUri: user.profileLogo?.localUri ?? null,
    };
  }, [user]);

  const [align, setAlign] = useState<LetterheadLogoAlign>("left");
  const [appearance, setAppearance] = useState<LetterheadAppearance>("original");
  const [includeName, setIncludeName] = useState(Boolean(baseline.businessName));
  const [includeAddress, setIncludeAddress] = useState(Boolean(baseline.address));
  const [includeContact, setIncludeContact] = useState(Boolean(baseline.contact));
  const [includeGstin, setIncludeGstin] = useState(Boolean(baseline.gstin));
  const [includeLogo, setIncludeLogo] = useState(Boolean(baseline.logoUri));
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topPct, setTopPct] = useState(String(DEFAULT_LETTERHEAD_MARGINS.topPct));

  React.useEffect(() => {
    let cancelled = false;
    if (!user?.profileLogo) {
      setLogoDataUri(null);
      return;
    }
    void readProfileLogoDataUri(user.profileLogo).then((uri) => {
      if (!cancelled) setLogoDataUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.profileLogo]);

  const previewLogoUri = includeLogo ? logoDataUri ?? baseline.logoUri : null;
  const headerStyle = [
    styles.previewHeader,
    align === "center" ? styles.previewHeaderCenter : null,
    align === "right" ? styles.previewHeaderRight : null,
  ];

  const onSave = async () => {
    if (!user || saving) return;
    setError(null);
    const margins = {
      ...DEFAULT_LETTERHEAD_MARGINS,
      topPct: Math.max(0, Math.min(80, parseInt(topPct || "19", 10) || 19)),
    };
    const bounds = validateWritingMargins(margins);
    if (!bounds.ok) {
      setError(t("letterhead.setupSaveFailedUnchanged"));
      return;
    }

    // Prefer data URI for PDF embed; fall back to local file URI if read failed.
    const logoForSave = includeLogo
      ? logoDataUri ?? baseline.logoUri
      : null;

    const layout: LetterheadGeneratedLayout = {
      version: 1,
      logoAlign: align,
      appearance,
      businessName: includeName ? baseline.businessName : null,
      address: includeAddress ? baseline.address : null,
      contact: includeContact ? baseline.contact : null,
      gstin: includeGstin ? baseline.gstin : null,
      logoUri: logoForSave,
    };

    if (!layout.businessName && !layout.logoUri && !layout.address && !layout.contact) {
      setError(t("letterhead.setupNeedImage"));
      return;
    }

    setSaving(true);
    try {
      const existing = await getLetterheadRepository().get(user.uid);
      await getLetterheadRepository().save(user.uid, {
        sourceType: "generated_layout",
        generatedLayout: layout,
        imageDataUri: null,
        imageWidth: 0,
        imageHeight: 0,
        margins,
        // Preserve reusable assets when replacing only the page layout.
        signatureDataUri: existing?.signatureDataUri ?? null,
        stampDataUri: existing?.stampDataUri ?? null,
        defaultSenderName:
          layout.businessName ?? existing?.defaultSenderName ?? null,
        defaultSenderTitle:
          user.designation?.trim() || existing?.defaultSenderTitle || null,
        defaultComplimentaryClose: existing?.defaultComplimentaryClose ?? null,
        repeatTemplateAllPages: true,
      });
      router.replace("/(app)/letterhead");
    } catch {
      setError(t("letterhead.setupSaveFailedUnchanged"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll form>
      <Header title={t("letterhead.entryLogoTitle")} showBack backFrom="letterhead" />
      <LocaleUiText style={styles.lead}>{t("letterhead.entryLogoBody")}</LocaleUiText>

      {error ? <Banner tone="danger" message={error} /> : null}

      <LocaleUiText style={styles.section}>{t("letterhead.setupAdjust")}</LocaleUiText>
      <Card style={styles.card}>
        <View style={styles.preview}>
          <View style={headerStyle}>
            {previewLogoUri ? (
              <Image
                source={{ uri: previewLogoUri }}
                style={[
                  styles.logo,
                  appearance === "grayscale" || appearance === "mono"
                    ? { opacity: 0.92 }
                    : null,
                ]}
                resizeMode="contain"
                accessible
                accessibilityLabel={t("letterhead.entryLogoTitle")}
              />
            ) : null}
            <View>
              {includeName && baseline.businessName ? (
                <LocaleUiText style={styles.name}>{baseline.businessName}</LocaleUiText>
              ) : null}
              {includeAddress && baseline.address ? (
                <LocaleUiText style={styles.line}>{baseline.address}</LocaleUiText>
              ) : null}
              {includeContact && baseline.contact ? (
                <LocaleUiText style={styles.line}>{baseline.contact}</LocaleUiText>
              ) : null}
              {includeGstin && baseline.gstin ? (
                <LocaleUiText style={styles.line}>GSTIN: {baseline.gstin}</LocaleUiText>
              ) : null}
            </View>
          </View>
          <LocaleUiText style={styles.sample}>
            {t("letterhead.helperBase")}
          </LocaleUiText>
        </View>
      </Card>

      <LocaleUiText style={styles.section}>{t("letterhead.genLayoutSection")}</LocaleUiText>
      <View style={styles.row}>
        {ALIGNS.map((a) => {
          const label =
            a === "left"
              ? t("letterhead.genAlignLeft")
              : a === "center"
                ? t("letterhead.genAlignCenter")
                : t("letterhead.genAlignRight");
          return (
            <Pressable
              key={a}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: align === a }}
              onPress={() => setAlign(a)}
              style={[styles.chip, align === a ? styles.chipOn : null]}
            >
              <LocaleUiText style={styles.chipText}>{label}</LocaleUiText>
            </Pressable>
          );
        })}
      </View>

      <LocaleUiText style={styles.section}>{t("letterhead.genAppearanceSection")}</LocaleUiText>
      <View style={styles.row}>
        {APPEARANCES.map((a) => {
          const label =
            a === "original"
              ? t("letterhead.genAppearanceOriginal")
              : a === "color"
                ? t("letterhead.genAppearanceColor")
                : a === "grayscale"
                  ? t("letterhead.genAppearanceGrayscale")
                  : t("letterhead.genAppearanceMono");
          return (
            <Pressable
              key={a}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: appearance === a }}
              onPress={() => setAppearance(a)}
              style={[styles.chip, appearance === a ? styles.chipOn : null]}
            >
              <LocaleUiText style={styles.chipText}>{label}</LocaleUiText>
            </Pressable>
          );
        })}
      </View>

      <LocaleUiText style={styles.section}>{t("letterhead.genDetailsSection")}</LocaleUiText>
      <Card style={styles.card}>
        {[
          {
            key: "logo",
            label: t("letterhead.entryLogoTitle"),
            value: includeLogo,
            set: setIncludeLogo,
            available: Boolean(baseline.logoUri),
          },
          {
            key: "name",
            label: t("letterhead.fieldName"),
            value: includeName,
            set: setIncludeName,
            available: Boolean(baseline.businessName),
          },
          {
            key: "address",
            label: t("letterhead.genFieldAddress"),
            value: includeAddress,
            set: setIncludeAddress,
            available: Boolean(baseline.address),
          },
          {
            key: "contact",
            label: t("letterhead.genFieldContact"),
            value: includeContact,
            set: setIncludeContact,
            available: Boolean(baseline.contact),
          },
          {
            key: "gstin",
            label: t("letterhead.genFieldGstin"),
            value: includeGstin,
            set: setIncludeGstin,
            available: Boolean(baseline.gstin),
          },
        ].map((row) =>
          row.available ? (
            <View key={row.key} style={styles.toggleRow}>
              <LocaleUiText style={styles.chipText}>{row.label}</LocaleUiText>
              <Switch
                value={row.value}
                onValueChange={row.set}
                accessibilityLabel={row.label}
              />
            </View>
          ) : null
        )}
      </Card>

      <TextField
        label={t("letterhead.setupTopMargin")}
        keyboardType="number-pad"
        value={topPct}
        onChangeText={(v) => setTopPct(v.replace(/[^0-9]/g, "").slice(0, 2))}
        maxLength={2}
      />

      <View style={styles.cta}>
        <Button
          label={saving ? t("letterhead.setupSaving") : t("letterhead.setupSave")}
          onPress={() => void onSave()}
          loading={saving}
          disabled={saving}
        />
      </View>
    </Screen>
  );
}
