import React, { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import type { UserProfile } from "@/domain/types";
import { profileLogoInitials } from "@/services/profileLogo/storage";
import { radius, typography, useThemedStyles } from "@/theme";

interface ProfileAvatarProps {
  user: UserProfile | null;
  size?: number;
}

export function ProfileAvatar({ user, size = 56 }: ProfileAvatarProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: {
        width: size,
        height: size,
        borderRadius: radius.lg,
        overflow: "hidden",
        backgroundColor: c.primaryLight,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: c.divider,
      },
      image: { width: size, height: size },
      initials: {
        ...typography.bodyStrong,
        fontSize: Math.round(size * 0.32),
        color: c.primaryDark,
      },
    })
  );

  const initials = useMemo(
    () =>
      profileLogoInitials(
        user?.displayName ?? null,
        user?.businessName ?? null,
        user?.phoneE164?.slice(-2) ?? "VD"
      ),
    [user]
  );

  const logoUri = user?.profileLogo?.localUri;

  return (
    <View style={styles.wrap}>
      {logoUri ? (
        <Image
          source={{ uri: logoUri }}
          style={styles.image}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={styles.initials}>{initials}</Text>
      )}
    </View>
  );
}
