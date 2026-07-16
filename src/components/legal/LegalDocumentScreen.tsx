import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  PRIVACY_POLICY_SECTIONS,
  TERMS_OF_USE_SECTIONS,
  type LegalSection,
} from "@/content/legal/documents";
import { legal, legalDocumentTitle, type LegalDocumentId } from "@/config/legal";
import { openPublicLinkOrExplain, getSupportEmail } from "@/config/publicLinks";
import { Card, Header, Screen, LocaleUiText } from "@/components/ui";
import { useT } from "@/i18n";
import { openSafeMailto } from "@/utils/safeMailto";
import { spacing, typography, useThemedStyles } from "@/theme";

function sectionsFor(doc: LegalDocumentId): LegalSection[] {
  return doc === "privacy" ? PRIVACY_POLICY_SECTIONS : TERMS_OF_USE_SECTIONS;
}

interface LegalDocumentScreenProps {
  doc: LegalDocumentId;
  showBack?: boolean;
}

export function LegalDocumentScreen({ doc, showBack = true }: LegalDocumentScreenProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      meta: { ...typography.caption, color: c.textSubtle, marginBottom: spacing.lg, lineHeight: 18 },
      sectionTitle: {
        ...typography.bodyStrong,
        color: c.text,
        marginBottom: spacing.xs,
        marginTop: spacing.md,
      },
      body: { ...typography.body, color: c.textMuted, lineHeight: 22, marginBottom: spacing.sm },
      webLink: { ...typography.captionStrong, color: c.primaryDark, marginTop: spacing.lg },
    })
  );

  const hostedKind = doc === "privacy" ? "privacy" : "terms";
  const supportEmail = getSupportEmail();

  return (
    <Screen scroll>
      <Header
        title={legalDocumentTitle(doc)}
        showBack={showBack}
        backFrom={showBack ? "settings" : undefined}
      />
      <Card>
        <LocaleUiText style={styles.meta}>
          {t("legal.viewerMeta", {
            effectiveDate: legal.effectiveDate,
            entity: legal.legalEntityName,
            version: doc === "privacy" ? legal.privacyVersion : legal.termsVersion,
          })}
        </LocaleUiText>
        {sectionsFor(doc).map((section) => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((p) => (
              <Text key={p.slice(0, 40)} style={styles.body}>
                {p}
              </Text>
            ))}
          </View>
        ))}
        <Pressable onPress={() => void openPublicLinkOrExplain(hostedKind)}>
          <LocaleUiText style={styles.webLink}>{t("legal.viewerHostedLink")}</LocaleUiText>
        </Pressable>
        <Pressable onPress={() => void openSafeMailto(supportEmail)}>
          <LocaleUiText style={styles.webLink}>
            {t("legal.contactPlaceholder", { email: supportEmail })}
          </LocaleUiText>
        </Pressable>
      </Card>
    </Screen>
  );
}
