import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";

import type { StartupDiagnostics } from "@/startup/types";
import { formatDiagnosticsPlainText } from "@/startup/diagnostics";
import { clearLocalBetaData } from "@/startup/clearLocalBetaData";

interface Props {
  diagnostics: StartupDiagnostics;
  onRetry: () => void;
}

/**
 * Secure full-screen startup failure UI. No secrets, tokens, PII, or paths.
 */
export function StartupFailureScreen({ diagnostics, onRetry }: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(formatDiagnosticsPlainText(diagnostics));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Copy failed", "Could not copy diagnostics on this device.");
    }
  }, [diagnostics]);

  const onClear = useCallback(() => {
    Alert.alert(
      "Clear local beta data?",
      "This removes only on-device SQLite, AsyncStorage, SecureStore session, drafts, and sync queues. Firebase cloud data is not deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear local data",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await clearLocalBetaData();
                onRetry();
              } catch {
                Alert.alert(
                  "Clear incomplete",
                  "Some local data could not be cleared. You can still retry startup."
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [onRetry]);

  const presence = Object.entries(diagnostics.firebaseVarPresence)
    .map(([k, v]) => `${k.replace("EXPO_PUBLIC_FIREBASE_", "")}:${v ? "yes" : "no"}`)
    .join("  ");

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Vyaamikk Diary</Text>
        <Text style={styles.title}>Startup could not finish</Text>
        <Text style={styles.body}>
          The app stayed open so you can diagnose the problem. Authentication and
          private data stay blocked until configuration is valid.
        </Text>

        <View style={styles.card}>
          <Row label="Version" value={diagnostics.buildVersion} />
          <Row label="versionCode" value={diagnostics.versionCode} />
          <Row label="Runtime" value={diagnostics.runtimeClass} />
          <Row label="App mode" value={diagnostics.appMode} />
          <Row label="Backend" value={diagnostics.backend} />
          <Row
            label="Native Firebase"
            value={String(diagnostics.nativeFirebaseDefaultApp)}
          />
          <Row
            label="JS Firebase"
            value={diagnostics.jsFirebaseInitialized ? "ready" : "not ready"}
          />
          <Row label="Failed stage" value={diagnostics.failedStage} />
          <Row label="Error code" value={diagnostics.errorCode} />
          <Row label="Checkpoints" value={diagnostics.checkpoints.join(" → ") || "—"} />
          <Text style={styles.section}>Firebase variable names</Text>
          <Text style={styles.mono}>{presence}</Text>
          <Text style={styles.section}>Message</Text>
          <Text style={styles.mono}>{diagnostics.redactedMessage}</Text>
        </View>

        {busy ? (
          <ActivityIndicator color="#3B41C5" style={{ marginTop: 16 }} />
        ) : (
          <View style={styles.actions}>
            <Action label={copied ? "Copied" : "Copy diagnostics"} onPress={onCopy} />
            <Action label="Retry startup" onPress={onRetry} primary />
            <Action label="Clear local beta data" onPress={onClear} danger />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Action({
  label,
  onPress,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.btn,
        primary && styles.btnPrimary,
        danger && styles.btnDanger,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          (primary || danger) && styles.btnTextOnColor,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F172A" },
  content: { padding: 20, paddingBottom: 40 },
  kicker: {
    color: "#94A3B8",
    fontSize: 13,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: { color: "#CBD5E1", fontSize: 15, lineHeight: 22, marginBottom: 16 },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  row: { gap: 2 },
  label: { color: "#94A3B8", fontSize: 12 },
  value: { color: "#F1F5F9", fontSize: 14, fontWeight: "600" },
  section: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 8,
    marginBottom: 2,
  },
  mono: { color: "#E2E8F0", fontSize: 12, lineHeight: 18 },
  actions: { marginTop: 18, gap: 10 },
  btn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#334155",
  },
  btnPrimary: { backgroundColor: "#3B41C5" },
  btnDanger: { backgroundColor: "#B91C1C" },
  btnText: { color: "#E2E8F0", fontSize: 15, fontWeight: "600" },
  btnTextOnColor: { color: "#FFFFFF" },
});
