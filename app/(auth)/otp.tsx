import { Redirect } from "expo-router";

/** Legacy path — permanent redirect to Indigo Auth v2. */
export default function LegacyOtpRedirect() {
  return <Redirect href="/(auth)/v2" />;
}
