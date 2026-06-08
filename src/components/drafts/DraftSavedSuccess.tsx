import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { PremiumActionButton } from "@/components/ui/PremiumActionButton";
import { PremiumSuccessPrompt } from "@/components/ui/PremiumSuccessPrompt";
import type { FormDraftRecord } from "@/repositories/formDraftsRepository";
import { buildDraftTitle } from "@/services/drafts/draftTitle";
import { useT } from "@/i18n";
import { spacing } from "@/theme";

export function DraftSavedSuccess({
  draft,
  onContinueEditing,
  onAddAnother,
}: {
  draft: FormDraftRecord;
  onContinueEditing: () => void;
  onAddAnother?: () => void;
}) {
  const t = useT();
  const router = useRouter();

  const title = buildDraftTitle(draft, t);

  return (
    <PremiumSuccessPrompt
      title={t("drafts.savedTitle")}
      subtitle={title}
      trustMessages={[t("executive.trust.local_first")]}
    >
      <View style={styles.actions}>
        <PremiumActionButton
          label={t("drafts.continueEditing")}
          onPress={onContinueEditing}
          variant="primary"
        />
        <PremiumActionButton
          label={t("drafts.viewDrafts")}
          onPress={() => router.push("/(app)/drafts")}
          variant="glass"
        />
        {onAddAnother ? (
          <PremiumActionButton
            label={t("composer.saveSuccess.addAnother")}
            onPress={onAddAnother}
            variant="glass"
          />
        ) : null}
        <PremiumActionButton
          label={t("composer.saveSuccess.dashboard")}
          onPress={() => router.replace("/(app)/(tabs)/you")}
          variant="ghost"
        />
      </View>
    </PremiumSuccessPrompt>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
});
