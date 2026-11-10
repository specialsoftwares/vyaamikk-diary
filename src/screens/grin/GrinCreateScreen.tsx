import React from "react";
import { View } from "react-native";

import { CreationScreenQuotaMeter } from "@/components/billing/CreationScreenQuotaMeter";
import { spacing } from "@/theme";

import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinCreateAdmittedBody } from "./GrinCreateAdmittedBody";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";
import { useGrinT } from "./grinScreenHooks";

export function GrinCreateScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.createTitle")}>
      {(session) => (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
            <CreationScreenQuotaMeter />
          </View>
          <GrinCreateAdmittedBody session={session} />
        </View>
      )}
    </GrinAdmissionGate>
  );
}

export { GrinCreateAdmittedBody };
