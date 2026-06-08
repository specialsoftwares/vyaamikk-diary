import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, View } from "react-native";

import { env } from "@/config/env";
import { openSafeExternalUrl } from "@/utils/safeUrl";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

interface LegalConsentFooterProps {
  style?: object;
}

/** Standard “by continuing” Terms + Privacy copy with tappable links. */
export function LegalConsentFooter({ style }: LegalConsentFooterProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { marginTop: spacing.sm },
      text: { ...typography.caption, color: c.textSubtle, lineHeight: 20, textAlign: "center" },
      link: { ...typography.captionStrong, color: c.primary },
    })
  );

  const openTerms = () => void openSafeExternalUrl(env.brand.termsUrl);
  const openPrivacy = () => void openSafeExternalUrl(env.brand.privacyUrl);

  return (
    <View style={[styles.wrap, style]}>
      <LocaleUiText style={styles.text}>
        {t("login.legalPrefix")}{" "}
        <LocaleUiText style={styles.link} onPress={openTerms} accessibilityRole="link">
          {t("settings.terms")}
        </LocaleUiText>
        {t("login.legalAnd")}{" "}
        <LocaleUiText style={styles.link} onPress={openPrivacy} accessibilityRole="link">
          {t("settings.privacy")}
        </LocaleUiText>
        {t("login.legalSuffix")}
      </LocaleUiText>
    </View>
  );
}
