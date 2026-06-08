import React from "react";

import { AuthFlowGate } from "@/auth-v2/AuthFlowGate";

/** Indigo Auth v2 — sole sign-in entry. */
export default function AuthV2Route() {
  return <AuthFlowGate />;
}
