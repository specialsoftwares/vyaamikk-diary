import React from "react";
import { useLocalSearchParams } from "expo-router";

import { LegalDocumentScreen } from "@/components/legal/LegalDocumentScreen";
import type { LegalDocumentId } from "@/config/legal";

export default function LegalDocumentRoute() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const id: LegalDocumentId = doc === "terms" ? "terms" : "privacy";
  return <LegalDocumentScreen doc={id} />;
}
