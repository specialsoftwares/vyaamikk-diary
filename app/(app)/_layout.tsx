import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";

import { getAuthEntryHref, needsAuthWrapperEmailCompletion } from "@/config/authWrapper";
import { useAuth } from "@/state/auth";
import { useThemeColors } from "@/theme";

/**
 * Defensive guard for the authed area. The boot screen is the primary
 * router but a deep-link could otherwise land a user past the profile
 * gate. We re-check here on every status / profile change.
 */
export default function AppLayout() {
  const { status, user } = useAuth();
  const router = useRouter();
  const colors = useThemeColors();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (status === "signed_out") {
        if (!cancelled) router.replace(getAuthEntryHref());
        return;
      }
      if (status === "signed_in" && user) {
        if (await needsAuthWrapperEmailCompletion(user)) {
          if (!cancelled) router.replace("/(auth)/v2");
          return;
        }
        if (!user.profileCompletedAt && !cancelled) {
          router.replace("/(auth)/complete-profile");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    />
  );
}
