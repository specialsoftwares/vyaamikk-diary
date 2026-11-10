import { useEffect } from "react";
import { useRouter } from "expo-router";

import { useAuth } from "@/state/auth";

/**
 * Retired launch gate. A direct open continues to profile details, or to
 * sign-in when no account is present. It does not collect a date of birth
 * and it does not call the age-assessment callable.
 */

export default function AgeDeclarationRoute() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    router.replace(user ? "/(auth)/complete-profile" : "/");
  }, [router, user]);

  return null;
}
