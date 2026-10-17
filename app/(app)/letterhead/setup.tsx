import { Redirect } from "expo-router";

/** Old template editor. Do not restore the crop, scanner, or save form. */
export default function RetiredLetterheadSetup() {
  return <Redirect href="/(app)/letterhead/history" />;
}
