import React from "react";

import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinEwbAdmittedBody } from "./GrinEwbAdmittedBody";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";
import { useGrinT } from "./grinScreenHooks";

export function GrinEwbScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.ewbTitle")}>
      {(session) => <GrinEwbAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

export { GrinEwbAdmittedBody };
