import { Stack } from "expo-router";

export default function ComposerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackButtonMenuEnabled: false,
      }}
    />
  );
}
