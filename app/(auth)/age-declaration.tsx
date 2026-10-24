import React from "react";
import { useRouter } from "expo-router";

import { AgeDeclarationScreen } from "@/auth-v2/screens/AgeDeclarationScreen";

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
