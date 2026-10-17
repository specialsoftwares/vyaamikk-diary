import React from "react";

import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinReturnSelectAdmittedBody } from "./GrinReturnSelectAdmittedBody";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";
import { useGrinT } from "./grinScreenHooks";

export function GrinReturnSelectScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.returnSelectTitle")}>
      {(session) => <GrinReturnSelectAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

export { GrinReturnSelectAdmittedBody };
