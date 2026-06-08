import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FormDraftRecord } from "@/repositories/formDraftsRepository";
import { CategoryAccentChip } from "@/components/ui/CategoryAccentChip";
import { buildDraftMetadataLine, buildDraftTitle } from "@/services/drafts/draftTitle";
import { formatRelative } from "@/utils/date";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

function DraftListRowInner({
  draft,
  onPress,
}: {
  draft: FormDraftRecord;
  onPress: () => void;
}) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.sm,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      main: { flex: 1, gap: 4 },
      title: { ...typography.bodyStrong, color: c.text },
      meta: { ...typography.caption, color: c.textMuted },
      chip: { alignSelf: "flex-start", marginBottom: 2 },
    })
  );

  const line = buildDraftMetadataLine(draft, t);
  const edited = formatRelative(draft.updatedAt);

  return (
    <View style={styles.row}>
      <Pressable style={styles.main} onPress={onPress} accessibilityRole="button">
        <View style={styles.chip}>
          <CategoryAccentChip accentKey="work" label={t("drafts.chip")} compact />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {buildDraftTitle(draft, t)}
        </Text>
        <Text style={styles.meta} numberOfLines={2}>
          {line} · {t("drafts.edited", { when: edited })}
        </Text>
      </Pressable>
    </View>
  );
}

export const DraftListRow = memo(DraftListRowInner);
