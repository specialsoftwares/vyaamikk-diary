import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { setCrashReportingEnabled } from "@/services/telemetry/crashReporter";
import { readTelemetryConsent, writeTelemetryConsent } from "@/services/telemetry/telemetryConsent";
import { spacing } from "@/theme";

import { SettingsPreferenceRow } from "./SettingsPreferenceRow";

export function CrashReportsPreferenceRow() {
  const [enabled, setEnabled] = useState(false);

  const reload = useCallback(async () => {
    const stored = await readTelemetryConsent();
    setEnabled(stored === true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const onPress = useCallback(async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      await writeTelemetryConsent(next);
      setCrashReportingEnabled(next);
    } catch {
      setEnabled(!next);
      setCrashReportingEnabled(!next);
    }
  }, [enabled]);

  const value = enabled ? "Enabled" : "Disabled";

  return (
    <View style={styles.inset}>
      <SettingsPreferenceRow
        icon="bug-outline"
        label="Crash Reports"
        value={value}
        valueTone={enabled ? "positive" : "muted"}
        onPress={() => void onPress()}
        accessibilityLabel={`Crash Reports, ${value}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  inset: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
