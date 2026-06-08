import React, { useMemo } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import type { UserProfile } from "@/domain/types";
import { useT } from "@/i18n";
import { executiveCardDepth } from "@/theme/cardDepth";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";
import {
  buildProfileDetailRows,
  canRequestProfileDetailsEdit,
  type ProfileDetailRowModel,
} from "@/utils/profile/profileDetailDisplay";

interface ProfileYourDetailsViewCardProps {
  user: UserProfile;
  onRequestEdit: () => void;
}

export function ProfileYourDetailsViewCard({
  user,
  onRequestEdit,
}: ProfileYourDetailsViewCardProps) {
  const t = useT();
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const depth = executiveCardDepth(isDark, colors, 2);
  const rows = useMemo(() => buildProfileDetailRows(user, t), [user, t]);
  const canEdit = canRequestProfileDetailsEdit(user);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        ...depth,
        marginBottom: spacing.lg,
        overflow: "hidden",
      },
      headerBand: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        backgroundColor: isDark ? "rgba(59, 65, 197, 0.35)" : "rgba(59, 65, 197, 0.12)",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(42, 47, 143, 0.15)",
      },
      headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
      headerTitle: {
        ...typography.captionStrong,
        color: isDark ? "rgba(255,255,255,0.9)" : c.primaryDark,
        letterSpacing: 0.6,
        textTransform: "uppercase",
      },
      verifiedChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      },
      verifiedText: {
        ...typography.micro,
        color: isDark ? "rgba(255,255,255,0.55)" : c.textMuted,
      },
      editBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.85)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(42, 47, 143, 0.2)",
      },
      editLabel: {
        ...typography.micro,
        color: isDark ? "#FFFFFF" : c.primaryDark,
        fontWeight: "600",
      },
      body: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
      row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.sm,
        paddingVertical: spacing.sm + 2,
      },
      rowIcon: {
        width: 28,
        alignItems: "center",
        paddingTop: 2,
      },
      rowCopy: { flex: 1, gap: 2 },
      rowLabel: { ...typography.micro, color: c.textSubtle, letterSpacing: 0.2 },
      rowValue: { ...typography.bodyStrong, color: c.text, lineHeight: 22 },
      rowValueMissing: { ...typography.body, color: c.textMuted, fontStyle: "italic" },
      rowHint: { ...typography.caption, color: c.textMuted, lineHeight: 17, marginTop: 2 },
      rowHintLocked: { ...typography.caption, color: c.textSubtle, lineHeight: 17, marginTop: 2 },
      divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: c.divider,
        marginLeft: 28 + spacing.sm,
      },
    })
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerBand}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="shield-account-outline"
            size={18}
            color={isDark ? "rgba(255,255,255,0.85)" : colors.primaryDark}
          />
          <LocaleUiText style={styles.headerTitle}>{t("identity.sectionDetails")}</LocaleUiText>
          <View style={styles.verifiedChip}>
            <MaterialCommunityIcons
              name="check-decagram"
              size={14}
              color={isDark ? "rgba(255,255,255,0.55)" : colors.primary}
            />
            <LocaleUiText style={styles.verifiedText}>{t("identity.details.verifiedFromSignIn")}</LocaleUiText>
          </View>
        </View>
        {canEdit ? (
          <Pressable
            onPress={onRequestEdit}
            style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.88 }]}
            accessibilityRole="button"
            accessibilityLabel={t("identity.details.editRequest")}
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={16}
              color={isDark ? "#FFFFFF" : colors.primaryDark}
            />
            <LocaleUiText style={styles.editLabel}>{t("identity.details.editRequest")}</LocaleUiText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        {rows.map((row, index) => (
          <View key={row.key}>
            <DetailRow row={row} styles={styles} isDark={isDark} colors={colors} t={t} />
            {index < rows.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function DetailRow({
  row,
  styles,
  isDark,
  colors,
  t,
}: {
  row: ProfileDetailRowModel;
  styles: Record<string, object>;
  isDark: boolean;
  colors: { primary: string; textMuted: string };
  t: ReturnType<typeof useT>;
}) {
  const iconColor = isDark ? "rgba(255,255,255,0.55)" : colors.textMuted;
  const iconName = row.icon as keyof typeof MaterialCommunityIcons.glyphMap;

  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={iconName} size={18} color={iconColor} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{row.label}</Text>
        {row.missing ? (
          <>
            <LocaleUiText style={styles.rowValueMissing}>{t("identity.details.notAdded")}</LocaleUiText>
            {row.hint ? <Text style={styles.rowHint}>{row.hint}</Text> : null}
          </>
        ) : (
          <>
            <Text style={styles.rowValue} numberOfLines={3}>
              {row.value}
            </Text>
            {row.locked && row.hint ? (
              <Text style={styles.rowHintLocked}>{row.hint}</Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}
