import React, { useCallback, useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, Switch, Text, View } from "react-native";

import { Banner, Card, Header, PermissionRationaleModal, Screen, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import type { LocationFootprintPreferences } from "@/domain/locationFootprintPreferences";
import {
  loadLocationFootprintPreferences,
  saveLocationFootprintPreferences,
  syncLocationFootprintPermissionStatus,
} from "@/services/location/locationFootprintPreferences";
import { locationService } from "@/services/location";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function LocationFootprintsSettingsScreen() {
  const t = useT();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<LocationFootprintPreferences | null>(null);
  const [showRationale, setShowRationale] = useState(false);
  const [busy, setBusy] = useState(false);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      lead: { ...typography.body, color: c.textMuted, lineHeight: 22, marginBottom: spacing.lg },
      section: { gap: spacing.md, marginBottom: spacing.lg },
      row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
      },
      rowLabel: { ...typography.bodyStrong, color: c.text, flex: 1 },
      rowHint: { ...typography.caption, color: c.textMuted, marginTop: 4, lineHeight: 18 },
      status: { ...typography.captionStrong, color: c.primaryDark },
      link: { ...typography.captionStrong, color: c.primary, marginTop: spacing.sm },
    })
  );

  const reload = useCallback(async () => {
    if (!user?.uid) return;
    await syncLocationFootprintPermissionStatus(user.uid);
    const next = await loadLocationFootprintPreferences(user.uid);
    setPrefs(next);
  }, [user?.uid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const permissionLabel = (status: string) => {
    switch (status) {
      case "granted":
        return t("locationFootprints.settings.statusGranted");
      case "denied":
        return t("locationFootprints.settings.statusDenied");
      case "blocked":
        return t("locationFootprints.settings.statusBlocked");
      default:
        return t("locationFootprints.settings.statusUnknown");
    }
  };

  const onToggle = async (next: boolean) => {
    if (!user?.uid || !prefs) return;
    if (!next) {
      await saveLocationFootprintPreferences(user.uid, {
        locationFootprintsEnabled: false,
      });
      await reload();
      return;
    }
    setShowRationale(true);
  };

  const enableAfterRationale = async () => {
    if (!user?.uid) return;
    setBusy(true);
    setShowRationale(false);
    try {
      await saveLocationFootprintPreferences(user.uid, {
        locationFootprintsEnabled: true,
        locationConsentAcceptedAt: Date.now(),
      });
      await locationService.requestPermission();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (!user || !prefs) return null;

  return (
    <Screen scroll form>
      <Header
        variant="executive"
        title={t("locationFootprints.settings.title")}
        showBack
        backFrom="settings"
      />
      <LocaleUiText style={styles.lead}>{t("locationFootprints.settings.lead")}</LocaleUiText>

      <Card style={styles.section}>
        <View>
          <LocaleUiText style={styles.rowLabel}>{t("locationFootprints.settings.osPermission")}</LocaleUiText>
          <Text style={styles.status}>{permissionLabel(prefs.locationPermissionStatus)}</Text>
          <LocaleUiText style={styles.rowHint}>{t("locationFootprints.settings.osHint")}</LocaleUiText>
          {prefs.locationPermissionStatus !== "granted" ? (
            <LocaleUiText
              style={styles.link}
              onPress={() => {
                if (Platform.OS === "ios") void Linking.openSettings();
                else void Linking.openSettings();
              }}
            >
              {t("locationFootprints.settings.openPhoneSettings")}
            </LocaleUiText>
          ) : null}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <LocaleUiText style={styles.rowLabel}>{t("locationFootprints.settings.enableLabel")}</LocaleUiText>
            <LocaleUiText style={styles.rowHint}>{t("locationFootprints.settings.enableHint")}</LocaleUiText>
          </View>
          <Switch
            value={prefs.locationFootprintsEnabled}
            onValueChange={(v) => void onToggle(v)}
            disabled={busy}
          />
        </View>
      </Card>

      <Banner tone="info" message={t("locationFootprints.settings.privacyBanner")} />

      <PermissionRationaleModal
        visible={showRationale}
        title={t("locationFootprints.rationale.title")}
        body={t("locationFootprints.rationale.body")}
        allowLabel={t("locationFootprints.rationale.allow")}
        notNowLabel={t("common.notNow")}
        loading={busy}
        onAllow={() => void enableAfterRationale()}
        onDismiss={() => setShowRationale(false)}
      />
    </Screen>
  );
}
