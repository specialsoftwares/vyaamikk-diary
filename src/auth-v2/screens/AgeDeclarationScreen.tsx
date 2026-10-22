import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { PRIVACY_POLICY_SECTIONS } from "@/content/legal/documents";
import { assessSelfDeclaredDob } from "@/domain/ageEligibility";
import { callRecordAgeAssessment } from "@/services/auth/identityCallable";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";

/**
 * Self-declared date of birth. The server decides eligibility and does not keep the date.
 * Sign-out, support text, and account deletion stay available before the gate is passed.
 */
export function AgeDeclarationScreen({
  onEligible,
}: {
  onEligible: (profileCompleted: boolean) => void;
}) {
  const t = useT();
  const { user, signOut, requestAccountDeletion, applyServerProfile } = useAuth();
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const support = PRIVACY_POLICY_SECTIONS.find((section) => section.title === "Retention & deletion");

  async function submit() {
    if (!user || busy) return;
    const local = assessSelfDeclaredDob({ dateOfBirth: dateOfBirth.trim(), nowMs: Date.now() });
    if (!local.ok) {
      setMessage(t("ageGate.invalid"));
      return;
    }
    setBusy(true);
    try {
      const result = await callRecordAgeAssessment(dateOfBirth.trim());
      const next = { ...user, ...result };
      await applyServerProfile(next);
      if (result.ageEligibility === "eligible") {
        onEligible(Boolean(user.profileCompletedAt));
        return;
      }
      setMessage(t("ageGate.ineligible"));
    } catch {
      setMessage(t("ageGate.invalid"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t("ageGate.title")}</Text>
      <Text style={styles.body}>{t("ageGate.body")}</Text>
      <Text style={styles.note}>{t("ageGate.notVerified")}</Text>
      <Text style={styles.label}>{t("ageGate.dateLabel")}</Text>
      <TextInput
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="YYYY-MM-DD"
        style={styles.input}
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable onPress={() => void submit()} style={styles.primary}>
        <Text style={styles.primaryText}>{t("ageGate.continue")}</Text>
      </Pressable>
      <Pressable onPress={() => setSupportOpen((open) => !open)}>
        <Text style={styles.link}>{t("ageGate.support")}</Text>
      </Pressable>
      {supportOpen ? (
        <Text style={styles.body}>{support?.paragraphs.join("\n\n") ?? t("ageGate.supportBody")}</Text>
      ) : null}
      <Pressable onPress={() => void signOut()}>
        <Text style={styles.link}>{t("ageGate.signOut")}</Text>
      </Pressable>
      <Pressable onPress={() => void requestAccountDeletion()}>
        <Text style={styles.link}>{t("ageGate.deleteAccount")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "600", marginBottom: 12 },
  body: { fontSize: 16, marginBottom: 12 },
  note: { fontSize: 14, marginBottom: 16 },
  label: { fontSize: 14, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  message: { marginBottom: 12 },
  primary: { padding: 14, borderRadius: 8, marginBottom: 16 },
  primaryText: { textAlign: "center", fontWeight: "600" },
  link: { paddingVertical: 10 },
});
