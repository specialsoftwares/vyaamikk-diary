import React from "react";

import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinAmendAdmittedBody } from "./GrinAmendAdmittedBody";
import { useGrinT } from "./grinScreenHooks";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";

export function GrinAmendScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.amendTitle")}>
      {(session) => <GrinAmendAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

export { GrinAmendAdmittedBody };
