import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Header, Screen, LocaleUiText } from "@/components/ui";
import { openPublicLinkOrExplain } from "@/config/publicLinks";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function LegalDocumentRoute() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const router = useRouter();
  const destination = doc === "privacy" || doc === "terms" ? doc : null;
  const opened = useRef(false);
  const [failed, setFailed] = useState(false);
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      body: { ...typography.body, color: colors.text, lineHeight: 22 },
      link: { ...typography.bodyStrong, color: colors.primary, marginTop: spacing.md },
    })
  );

  useEffect(() => {
    if (!destination || opened.current) return;
    opened.current = true;
    void openPublicLinkOrExplain(destination).then((ok) => {
      if (!ok) setFailed(true);
    });
  }, [destination]);

  return (
    <Screen scroll>
      <Header title={destination === "terms" ? "Terms of Use" : "Privacy Policy"} showBack />
      <LocaleUiText style={styles.body}>
        {destination
          ? failed
            ? "The page did not open. You can try again."
            : "Opening the public page in your browser."
          : "This page is not available."}
      </LocaleUiText>
      {destination ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void openPublicLinkOrExplain(destination).then((ok) => setFailed(!ok));
          }}
        >
          <LocaleUiText style={styles.link}>Open again</LocaleUiText>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <LocaleUiText style={styles.link}>Go back</LocaleUiText>
        </Pressable>
      )}
    </Screen>
  );
}
