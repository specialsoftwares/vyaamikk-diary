import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { BusinessIdentityScreen } from "@/auth-v2/screens/BusinessIdentityScreen";
import { useAuth } from "@/state/auth";

/** Business identity onboarding — Indigo Auth v2 shell only. */
export default function CompleteProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (user.profileCompletedAt && !user.ueidReleasedAt) {
      router.replace("/");
    }
  }, [user, router]);

  if (!user) return null;
  if (user.profileCompletedAt && !user.ueidReleasedAt) return null;

  return <BusinessIdentityScreen />;
}
