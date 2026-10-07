/**
 * Create / edit letterhead from business logo + selected details.
 *
 * NEW template: profile is the initial source.
 * EDIT existing generated template: restore saved alignment, appearance,
 * included fields/values, logo, margins, and preserved signature/stamp/defaults.
 * Profile values are not silently applied on reopen — use "Refresh from profile".
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";

import {
  Banner,
  Button,
  Card,
  Header,
  Loader,
  LocaleUiText,
  Screen,
} from "@/components/ui";
import { WritingAreaControls } from "@/components/letterhead/WritingAreaControls";
import { useAuth } from "@/state/auth";
import {
  DEFAULT_LETTERHEAD_MARGINS,
  getLetterheadRepository,
  type LetterheadAppearance,
  type LetterheadConfig,
  type LetterheadGeneratedLayout,
  type LetterheadLogoAlign,
  type LetterheadMargins,
  validateWritingMargins,
} from "@/services/letterhead";
import { generatedHeaderFlex } from "@/services/letterhead/letterheadVisualSpec";
import { readProfileLogoDataUri } from "@/services/profileLogo/storage";
import {
  captureAdmissionToken,
  mayIssueRemoteWork,
} from "@/sync/syncSessionOwnership";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

const ALIGNS: LetterheadLogoAlign[] = ["left", "center", "right"];
/** PDF applies real CSS filters for grayscale/mono; RN preview notes that. */
const APPEARANCES: LetterheadAppearance[] = ["original", "color", "grayscale", "mono"];

type FieldBundle = {
  businessName: string | null;
  address: string | null;
  contact: string | null;
  gstin: string | null;
};

function profileFields(user: NonNullable<ReturnType<typeof useAuth>["user"]>): FieldBundle {
  const parts = [
    user.pinLocality?.trim(),
    user.pinDistrict?.trim(),
    user.pinState?.trim(),
    user.pinCode?.trim(),
  ].filter(Boolean);
  const contact = [user.phoneE164?.trim(), user.businessEmail?.trim()].filter(Boolean);
  return {
    businessName: user.businessName?.trim() || user.displayName?.trim() || null,
    address: parts.length ? parts.join(", ") : null,
    contact: contact.length ? contact.join(" · ") : null,
    gstin: user.gstin?.trim() || null,
  };
}

function isDurableLogoUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("data:") || uri.startsWith("https://") || uri.startsWith("http://");
}

export default function LetterheadGenerateScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const saveGuard = useRef(false);
  const mounted = useRef(true);

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
      chipOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
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

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<LetterheadConfig | null>(null);
  const [align, setAlign] = useState<LetterheadLogoAlign>("left");
  const [appearance, setAppearance] = useState<LetterheadAppearance>("original");
  const [fields, setFields] = useState<FieldBundle>({
    businessName: null,
    address: null,
    contact: null,
    gstin: null,
  });
  const [includeName, setIncludeName] = useState(false);
  const [includeAddress, setIncludeAddress] = useState(false);
  const [includeContact, setIncludeContact] = useState(false);
  const [includeGstin, setIncludeGstin] = useState(false);
  const [includeLogo, setIncludeLogo] = useState(false);
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [margins, setMargins] = useState<LetterheadMargins>(DEFAULT_LETTERHEAD_MARGINS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadLogoFromProfile = useCallback(async () => {
    if (!user?.profileLogo) {
      setLogoDataUri(null);
      setLogoError(false);
      return;
    }
    const session = captureAdmissionToken();
    if (!session || !mayIssueRemoteWork(session, user.uid)) return;
    try {
      const uri = await readProfileLogoDataUri(user.profileLogo);
      if (!mounted.current) return;
      if (!mayIssueRemoteWork(session, user.uid)) return;
      if (uri && isDurableLogoUri(uri)) {
        setLogoDataUri(uri);
        setLogoError(false);
      } else {
        setLogoDataUri(null);
        setLogoError(true);
      }
    } catch {
      if (mounted.current) {
        setLogoDataUri(null);
        setLogoError(true);
      }
    }
  }, [user]);

  const applyProfileAsNew = useCallback(() => {
    if (!user) return;
    const pf = profileFields(user);
    setFields(pf);
    setIncludeName(Boolean(pf.businessName));
    setIncludeAddress(Boolean(pf.address));
    setIncludeContact(Boolean(pf.contact));
    setIncludeGstin(Boolean(pf.gstin));
    setIncludeLogo(Boolean(user.profileLogo));
    setAlign("left");
    setAppearance("original");
    setMargins(DEFAULT_LETTERHEAD_MARGINS);
    void loadLogoFromProfile();
  }, [user, loadLogoFromProfile]);

  const restoreSaved = useCallback(
    (cfg: LetterheadConfig) => {
      const layout = cfg.generatedLayout;
      if (!layout) {
        applyProfileAsNew();
        return;
      }
      setAlign(layout.logoAlign);
      setAppearance(layout.appearance);
      setFields({
        businessName: layout.businessName,
        address: layout.address,
        contact: layout.contact,
        gstin: layout.gstin,
      });
      setIncludeName(Boolean(layout.businessName));
      setIncludeAddress(Boolean(layout.address));
      setIncludeContact(Boolean(layout.contact));
      setIncludeGstin(Boolean(layout.gstin));
      setMargins(cfg.margins ?? DEFAULT_LETTERHEAD_MARGINS);
      if (isDurableLogoUri(layout.logoUri)) {
        setLogoDataUri(layout.logoUri);
        setIncludeLogo(true);
        setLogoError(false);
      } else if (layout.logoUri) {
        // Saved device-local path is not portable — clear and offer retry.
        setLogoDataUri(null);
        setIncludeLogo(false);
        setLogoError(true);
      } else {
        setLogoDataUri(null);
        setIncludeLogo(false);
        setLogoError(false);
      }
    },
    [applyProfileAsNew]
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const session = captureAdmissionToken();
    setLoading(true);
    void getLetterheadRepository()
      .get(user.uid)
      .then((cfg) => {
        if (cancelled || !mounted.current) return;
        if (!session || !mayIssueRemoteWork(session, user.uid)) return;
        setExisting(cfg);
        if (cfg?.sourceType === "generated_layout" && cfg.generatedLayout) {
          restoreSaved(cfg);
        } else {
          applyProfileAsNew();
        }
      })
      .catch(() => {
        if (cancelled || !mounted.current) return;
        if (!session || !mayIssueRemoteWork(session, user.uid)) return;
        applyProfileAsNew();
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, restoreSaved, applyProfileAsNew]);

  const headerFlex = generatedHeaderFlex(align);
  const previewLogo = includeLogo && isDurableLogoUri(logoDataUri) ? logoDataUri : null;

  const onSave = async () => {
    if (!user || saveGuard.current) return;
    saveGuard.current = true;
    setError(null);
    const session = captureAdmissionToken();
    if (!session || !mayIssueRemoteWork(session, user.uid)) {
      setError(t("letterhead.setupSaveFailedUnchanged"));
      saveGuard.current = false;
      return;
    }

    const bounds = validateWritingMargins(margins);
    if (!bounds.ok) {
      setError(t("letterhead.setupSaveFailedUnchanged"));
      saveGuard.current = false;
      return;
    }

    const logoForSave = includeLogo && isDurableLogoUri(logoDataUri) ? logoDataUri : null;
    if (includeLogo && !logoForSave) {
      setError(t("letterhead.entryCouldNotOpenPhoto"));
      saveGuard.current = false;
      return;
    }

    // Include generated logo bytes in document-size validation.
    const logoBytes = logoForSave
      ? Math.ceil(((logoForSave.split(",")[1] ?? "").length * 3) / 4)
      : 0;
    if (logoBytes > 700_000) {
      setError(t("letterhead.setupImageTooLarge"));
      saveGuard.current = false;
      return;
    }

    const layout: LetterheadGeneratedLayout = {
      version: 1,
      logoAlign: align,
      appearance,
      businessName: includeName ? fields.businessName : null,
      address: includeAddress ? fields.address : null,
      contact: includeContact ? fields.contact : null,
      gstin: includeGstin ? fields.gstin : null,
      logoUri: logoForSave,
    };

    if (!layout.businessName && !layout.logoUri && !layout.address && !layout.contact) {
      setError(t("letterhead.setupNeedImage"));
      saveGuard.current = false;
      return;
    }

    setSaving(true);
    try {
      if (!mayIssueRemoteWork(session, user.uid)) {
        throw new Error("session_retired");
      }
      const prior = existing ?? (await getLetterheadRepository().get(user.uid));
      if (!mayIssueRemoteWork(session, user.uid)) {
        throw new Error("session_retired");
      }
      await getLetterheadRepository().save(
        user.uid,
        {
          sourceType: "generated_layout",
          generatedLayout: layout,
          imageDataUri: null,
          imageWidth: 0,
          imageHeight: 0,
          margins,
          signatureDataUri: prior?.signatureDataUri ?? null,
          stampDataUri: prior?.stampDataUri ?? null,
          defaultSenderName:
            layout.businessName ?? prior?.defaultSenderName ?? null,
          defaultSenderTitle:
            prior?.defaultSenderTitle ?? user.designation?.trim() ?? null,
          defaultComplimentaryClose: prior?.defaultComplimentaryClose ?? null,
          repeatTemplateAllPages: true,
        },
        session
      );
      if (!mayIssueRemoteWork(session, user.uid)) {
        // Stale completion — do not navigate or publish UI as success.
        return;
      }
      if (mounted.current) router.replace("/(app)/letterhead");
    } catch {
      if (mounted.current) {
        setError(t("letterhead.setupSaveFailedUnchanged"));
        // Retired owner: drop draft editor fields sourced from a prior session.
        if (!mayIssueRemoteWork(session, user.uid)) {
          setLogoDataUri(null);
          setIncludeLogo(false);
        }
      }
    } finally {
      if (mounted.current) setSaving(false);
      saveGuard.current = false;
    }
  };

  if (loading) {
    return (
      <Screen>
        <Header title={t("letterhead.entryLogoTitle")} showBack backFrom="letterhead" />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }

  return (
    <Screen scroll form>
      <Header title={t("letterhead.entryLogoTitle")} showBack backFrom="letterhead" />
      <LocaleUiText style={styles.lead}>{t("letterhead.entryLogoBody")}</LocaleUiText>

      {error ? <Banner tone="danger" message={error} /> : null}
      {logoError ? (
        <Banner tone="warning" message={t("letterhead.entryCouldNotOpenPhoto")} />
      ) : null}

      <Card style={styles.card}>
        <View style={styles.preview}>
          <View
            style={{
              flexDirection: headerFlex.flexDirection,
              justifyContent: headerFlex.justifyContent,
              alignItems: headerFlex.alignItems,
              gap: spacing.sm,
            }}
          >
            {previewLogo ? (
              <Image
                source={{ uri: previewLogo }}
                style={styles.logo}
                resizeMode="contain"
                accessible
                accessibilityLabel={t("letterhead.entryLogoTitle")}
              />
            ) : null}
            <View style={{ alignItems: headerFlex.alignItems }}>
              {includeName && fields.businessName ? (
                <LocaleUiText style={[styles.name, { textAlign: headerFlex.textAlign }]}>
                  {fields.businessName}
                </LocaleUiText>
              ) : null}
              {includeAddress && fields.address ? (
                <LocaleUiText style={[styles.line, { textAlign: headerFlex.textAlign }]}>
                  {fields.address}
                </LocaleUiText>
              ) : null}
              {includeContact && fields.contact ? (
                <LocaleUiText style={[styles.line, { textAlign: headerFlex.textAlign }]}>
                  {fields.contact}
                </LocaleUiText>
              ) : null}
              {includeGstin && fields.gstin ? (
                <LocaleUiText style={[styles.line, { textAlign: headerFlex.textAlign }]}>
                  GSTIN: {fields.gstin}
                </LocaleUiText>
              ) : null}
              {appearance === "grayscale" || appearance === "mono" ? (
                <LocaleUiText style={styles.line}>
                  {appearance === "mono"
                    ? t("letterhead.genAppearanceMono")
                    : t("letterhead.genAppearanceGrayscale")}{" "}
                  (PDF)
                </LocaleUiText>
              ) : null}
            </View>
          </View>
          <LocaleUiText style={styles.sample}>{t("letterhead.helperBase")}</LocaleUiText>
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
        {(
          [
            {
              key: "logo",
              label: t("letterhead.entryLogoTitle"),
              value: includeLogo,
              set: setIncludeLogo,
              available: Boolean(logoDataUri) || Boolean(user?.profileLogo) || logoError,
            },
            {
              key: "name",
              label: t("letterhead.fieldName"),
              value: includeName,
              set: setIncludeName,
              available: Boolean(fields.businessName),
            },
            {
              key: "address",
              label: t("letterhead.genFieldAddress"),
              value: includeAddress,
              set: setIncludeAddress,
              available: Boolean(fields.address),
            },
            {
              key: "contact",
              label: t("letterhead.genFieldContact"),
              value: includeContact,
              set: setIncludeContact,
              available: Boolean(fields.contact),
            },
            {
              key: "gstin",
              label: t("letterhead.genFieldGstin"),
              value: includeGstin,
              set: setIncludeGstin,
              available: Boolean(fields.gstin),
            },
          ] as const
        ).map((row) =>
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

      <WritingAreaControls
        margins={margins}
        onChange={setMargins}
        labels={{
          section: t("letterhead.setupAdjust"),
          top: t("letterhead.setupTopMargin"),
          bottom: t("letterhead.setupBottomMargin"),
          left: t("letterhead.setupLeftMargin"),
          right: t("letterhead.setupRightMargin"),
          decrease: t("letterhead.setupDecrease"),
          increase: t("letterhead.setupIncrease"),
        }}
      />

      <View style={styles.cta}>
        <Button
          label={t("letterhead.genRefreshProfile")}
          variant="secondary"
          onPress={() => {
            applyProfileAsNew();
          }}
          disabled={saving}
        />
        {logoError || (includeLogo && !logoDataUri) ? (
          <Button
            label={t("letterhead.genRetryLogo")}
            variant="ghost"
            onPress={() => void loadLogoFromProfile()}
            disabled={saving}
          />
        ) : null}
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
