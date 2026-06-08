import React from "react";
import { Stack } from "expo-router";

import { VyaamikkLandingPage } from "@/screens/public/VyaamikkLandingPage";

export default function LandingRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Vyaamikk Diary — Secure Business Records & Document Generation",
        }}
      />
      <VyaamikkLandingPage />
    </>
  );
}
