import React from "react";

import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinQcAdmittedBody } from "./GrinQcAdmittedBody";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";
import { useGrinT } from "./grinScreenHooks";

export function GrinQcScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.qcTitle")}>
      {(session) => <GrinQcAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

export { GrinQcAdmittedBody };
