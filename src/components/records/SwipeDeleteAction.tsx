import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

const ACTION_WIDTH = 88;

interface SwipeDeleteActionProps {
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

function SwipeDeleteActionInner({
  onPress,
  accessibilityLabel,
  disabled = false,
}: SwipeDeleteActionProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: {
        width: ACTION_WIDTH,
        marginLeft: spacing.sm,
        justifyContent: "center",
        alignItems: "stretch",
      },
      btn: {
        flex: 1,
        minHeight: 56,
        borderRadius: radius.lg,
        backgroundColor: c.danger,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: spacing.xs,
        gap: 4,
      },
      btnDisabled: { opacity: 0.55 },
      label: { ...typography.captionStrong, color: c.primaryOn },
    })
  );

  const onPressIn = useCallback(() => {
    if (disabled) return;
    if (Platform.OS === "ios") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [disabled]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        disabled={disabled}
        style={[styles.btn, disabled ? styles.btnDisabled : null]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={22} color="#FFFFFF" />
        <LocaleUiText style={styles.label}>{t("swipeDelete.action")}</LocaleUiText>
      </Pressable>
    </View>
  );
}

export const SwipeDeleteAction = memo(SwipeDeleteActionInner);
export const SWIPE_DELETE_ACTION_WIDTH = ACTION_WIDTH;
