import React from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { SkeletonList } from "@/components/ui/skeleton/SkeletonList";
import { useI18n } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import type { SearchPresentation } from "./resolveScreenState";
import { screenStateCopy } from "./screenStateCopy";

export function SearchOutcome({
  presentation,
  onClear,
  onRetry,
  onBack,
}: {
  presentation: SearchPresentation;
  onClear: () => void;
  onRetry: () => void;
  onBack?: () => void;
}) {
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
      title: { ...typography.titleMd, color: c.text, textAlign: "center" },
      body: { ...typography.body, color: c.textMuted, textAlign: "center", lineHeight: 22 },
    })
  );

  if (presentation === "loading") {
    return (
      <View style={styles.wrap}>
        <SkeletonList count={6} />
      </View>
    );
  }
  if (presentation === "failure") {
    return (
      <View style={styles.wrap}>
        <LocaleUiText style={styles.title}>{copy.searchFailedTitle}</LocaleUiText>
        <LocaleUiText style={styles.body}>{copy.searchFailedBody}</LocaleUiText>
        <Button label={copy.retry} onPress={onRetry} variant="secondary" fullWidth={false} />
      </View>
    );
  }
  if (presentation === "no_match") {
    return (
      <EmptyState
        title={copy.searchNoMatchTitle}
        message={copy.searchNoMatchBody}
        actionLabel={copy.searchClear}
        onAction={onClear}
        iconName="magnify"
      />
    );
  }
  if (presentation === "empty_library") {
    return (
      <EmptyState
        title={copy.searchEmptyLibraryTitle}
        message={copy.searchEmptyLibraryBody}
        actionLabel={onBack ? copy.back : undefined}
        onAction={onBack}
        iconName="notebook-outline"
      />
    );
  }
  return null;
}
