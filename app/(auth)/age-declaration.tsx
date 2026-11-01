import React from "react";
import { useRouter } from "expo-router";

import { AgeDeclarationScreen } from "@/auth-v2/screens/AgeDeclarationScreen";

/**
 * Legacy date-of-birth route. Launch and the normal new-user path do not
 * navigate here. Demographic age is an optional control on profile details.
 */

export default function AgeDeclarationRoute() {
  const router = useRouter();
  return (
    <AgeDeclarationScreen
      onEligible={(profileCompleted) => {
        router.replace(profileCompleted ? "/" : "/(auth)/complete-profile");
      }}
    />
  );
}
