import React from "react";

import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinCreateAdmittedBody } from "./GrinCreateAdmittedBody";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";
import { useGrinT } from "./grinScreenHooks";

export function GrinCreateScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.createTitle")}>
      {(session) => <GrinCreateAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

export { GrinCreateAdmittedBody };
