import { Redirect } from "expo-router";

/** Old "Your letterhead" gate. Creation is gone; saved letters stay on the list. */
export default function RetiredLetterheadGate() {
  return <Redirect href="/(app)/letterhead/history" />;
}
