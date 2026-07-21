import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Banner, Button, Screen, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { spacing, typography, useThemedStyles } from "@/theme";

/**
 * Manual / automated recovery entry — full question UI is driven by callables.
 * This screen explains the path and opens the support/automated flow.
 */
export default function AccountRecoveryScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      body: { ...typography.body, color: c.text, marginBottom: spacing.md },
      warn: { marginBottom: spacing.lg },
      actions: { gap: spacing.sm },
    })
  );

  return (
    <Screen scroll padded>
      <LocaleUiText style={styles.body}>
        Recover access when you no longer have your old mobile number. You will verify your
        bound email and answer account-history questions generated from your private profile.
      </LocaleUiText>
      <View style={styles.warn}>
        <Banner
          tone="warning"
          message="Never send OTPs, passwords, or recovery answers by email. Support will never ask for them."
        />
      </View>
      <View style={styles.actions}>
        <Button
          label="Start recovery"
          onPress={() =>
            router.push({
              pathname: "/(auth)/v2",
              params: { step: "email", from: "recovery" },
            })
          }
        />
        <Button
          label="Sign out"
          variant="secondary"
          onPress={() => void signOut()}
        />
      </View>
      {user?.coolingOffUntil ? (
        <LocaleUiText style={styles.body}>
          A cooling-off period may apply after successful recovery.
        </LocaleUiText>
      ) : null}
    </Screen>
  );
}
