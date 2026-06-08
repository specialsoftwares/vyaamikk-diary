/**
 * DEV-ONLY — wipe local (and optional shared-dev Firebase) test data.
 * Not available in production builds. Separate from Delete Account.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, useRouter } from "expo-router";

import { Banner, Button, Card, Header, Screen, TextField } from "@/components/ui";
import { getAuthEntryHref } from "@/config/authWrapper";
import { getActiveBackend } from "@/config/env";
import { userFacingMessage } from "@/domain/errors";
import {
  countFirestoreDevUsers,
  DEV_RESET_CONFIRM_PHRASE,
  resetAllDevData,
  resetDevDataForTarget,
} from "@/services/devReset";
import { formatDevFullResetSummary } from "@/services/devReset/formatDevResetSummary";
import { useAuth } from "@/state/auth";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function DevResetScreen() {
  const router = useRouter();
  const { hardDevSignOut } = useAuth();
  const [phrase, setPhrase] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [ueid, setUeid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [firestoreUserCount, setFirestoreUserCount] = useState<number | null | "loading">("loading");

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      lead: { ...typography.body, color: c.textMuted, marginBottom: spacing.lg, lineHeight: 22 },
      card: { gap: spacing.md, padding: spacing.md },
      label: { ...typography.captionStrong, color: c.textMuted, marginBottom: spacing.xs },
      backend: { ...typography.caption, color: c.textSubtle, marginBottom: spacing.md },
      section: { ...typography.captionStrong, color: c.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
      phraseInput: {
        ...typography.body,
        borderWidth: 1,
        borderColor: c.divider,
        borderRadius: 10,
        padding: spacing.md,
        color: c.text,
        backgroundColor: c.surface,
      },
      warn: { marginTop: spacing.md },
    })
  );

  const phraseOk = phrase.trim() === DEV_RESET_CONFIRM_PHRASE;
  const hasTarget = Boolean(phone.trim() || email.trim() || ueid.trim());
  const backend = getActiveBackend();

  useEffect(() => {
    if (backend !== "firebase-shared-dev") {
      setFirestoreUserCount(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const count = await countFirestoreDevUsers();
      if (!cancelled) setFirestoreUserCount(count);
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const finishReset = useCallback(async () => {
    await hardDevSignOut();
    router.replace(getAuthEntryHref());
  }, [router, hardDevSignOut]);

  const onResetAll = useCallback(async () => {
    if (!phraseOk) {
      setError(`Type exactly: ${DEV_RESET_CONFIRM_PHRASE}`);
      return;
    }
    Alert.alert(
      "Reset all dev data?",
      "This clears every local test identity, record, draft, PDF metadata, and suggestions on this device. Cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset everything",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              setError(null);
              setLastResult(null);
              try {
                const result = await resetAllDevData(phrase.trim());
                const summary = formatDevFullResetSummary(result);
                setLastResult(summary.message);
                Alert.alert(summary.title, summary.message, [
                  {
                    text: "Continue to login",
                    onPress: () => {
                      void finishReset();
                    },
                  },
                ]);
              } catch (e) {
                setError(userFacingMessage(e));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [phraseOk, phrase, finishReset]);

  const onResetTarget = useCallback(async () => {
    if (!phraseOk) {
      setError(`Type exactly: ${DEV_RESET_CONFIRM_PHRASE}`);
      return;
    }
    if (!hasTarget) {
      setError("Enter a phone, email, or UEID to reset.");
      return;
    }
    setBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const result = await resetDevDataForTarget(phrase.trim(), {
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        ueid: ueid.trim() || undefined,
      });
      if (!result.local.found) {
        setError("No matching identity found on this device.");
        return;
      }
      const fb = result.firebase
        ? ` Firebase: ${result.firebase.usersDeleted} user(s) removed.`
        : "";
      setLastResult(`Removed ${result.local.ueid ?? result.local.userId}.${fb}`);
      await finishReset();
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setBusy(false);
    }
  }, [phraseOk, phrase, hasTarget, phone, email, ueid, finishReset]);

  if (!__DEV__) {
    return <Redirect href="/(app)/(tabs)/settings" />;
  }

  return (
    <Screen scroll>
      <Header title="Developer reset" showBack backFrom="settings" />
      <Text style={styles.lead}>
        DEV ONLY — clears test identities and app data for fresh QA. Reloading the app (Metro r)
        does NOT clear anything — you must tap Reset below. This is not Delete Account.
      </Text>
      {backend === "firebase-shared-dev" ? (
        <Banner
          tone="warning"
          message={
            firestoreUserCount === "loading"
              ? "Shared-dev Firebase is active. Checking Firestore user count…"
              : firestoreUserCount === null
                ? "Shared-dev Firebase is active. Could not read Firestore user count — check network and rules."
                : firestoreUserCount === 0
                  ? "Shared-dev Firebase is active. Firestore has 0 users — safe to register fresh after a local reset."
                  : `Shared-dev Firebase is active. Firestore currently has ${firestoreUserCount} user(s). Full reset deletes them; if Firebase wipe fails, device is cleared but cloud identity remains — login may show “already registered”.`
          }
        />
      ) : (
        <Banner
          tone="info"
          message="local-mock mode — no Firestore. Data lives only on this device. Comment Firebase vars back into .env to test cloud auth."
        />
      )}
      <Text style={styles.backend}>Backend: {backend}</Text>

      {error ? (
        <View style={styles.warn}>
          <Banner tone="danger" message={error} />
        </View>
      ) : null}
      {lastResult ? (
        <View style={styles.warn}>
          <Banner tone="info" message={lastResult} />
        </View>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.label}>Confirmation phrase</Text>
        <TextInput
          style={styles.phraseInput}
          value={phrase}
          onChangeText={setPhrase}
          placeholder={DEV_RESET_CONFIRM_PHRASE}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
        />

        <Text style={styles.section}>Full reset</Text>
        <Text style={styles.lead}>
          Clears session, mock registry, SQLite, drafts, records, letterheads, pro packs, master
          data, search cache, onboarding flags, location consent, statutory state, and local files.
          {backend === "firebase-shared-dev"
            ? " Also deletes all Firestore users in the shared-dev project."
            : ""}
        </Text>
        <Button
          label={busy ? "Resetting…" : "Reset all local dev data"}
          variant="danger"
          onPress={() => void onResetAll()}
          disabled={busy || !phraseOk}
          loading={busy}
        />

        <Text style={styles.section}>Stuck on an old test session?</Text>
        <Text style={styles.lead}>
          If you only reloaded the app and still see a test user (e.g. Ashra Sharma), tap below
          after a full reset, or use full reset above to wipe Firebase + device data.
        </Text>
        <Button
          label="Emergency: clear saved session only"
          variant="secondary"
          onPress={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              try {
                await hardDevSignOut();
                router.replace(getAuthEntryHref());
              } catch (e) {
                setError(userFacingMessage(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
          disabled={busy}
        />

        <Text style={styles.section}>Targeted reset</Text>
        <TextField
          label="Mobile (10 digits or E.164)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          editable={!busy}
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!busy}
        />
        <TextField
          label="Vyaamikk ID (UEID)"
          value={ueid}
          onChangeText={setUeid}
          autoCapitalize="characters"
          editable={!busy}
        />
        <Button
          label="Reset this identity"
          variant="secondary"
          onPress={() => void onResetTarget()}
          disabled={busy || !phraseOk || !hasTarget}
          loading={busy}
        />
      </Card>

      <View style={styles.warn}>
        <Banner
          tone="warning"
          message="PDFs already exported or shared outside the app cannot be recalled. Firebase index deletes may fail under strict rules — use npm run dev:reset-firebase with Admin SDK if needed."
        />
      </View>
    </Screen>
  );
}
