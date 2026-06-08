import { Redirect } from "expo-router";

/** Legacy route — unified profile lives at Settings → Profile & Business Identity. */
export default function ProfileRedirect() {
  return <Redirect href="/(app)/settings/identity?from=settings" />;
}
