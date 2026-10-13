import { Redirect } from "expo-router";

/** Old logo-layout editor. Do not apply the current profile logo to an old design. */
export default function RetiredLetterheadGenerate() {
  return <Redirect href="/(app)/letterhead/history" />;
}
