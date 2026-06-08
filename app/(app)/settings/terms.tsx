import React from "react";
import { Redirect } from "expo-router";

/** Legacy route — opens in-app Terms viewer. */
export default function TermsScreen() {
  return <Redirect href="/legal/terms" />;
}
