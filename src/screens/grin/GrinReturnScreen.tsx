import React from "react";

import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinReturnAdmittedBody } from "./GrinReturnAdmittedBody";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";
import { useGrinT } from "./grinScreenHooks";

export function GrinReturnScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.returnTitle")}>
      {(session) => <GrinReturnAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

export { GrinReturnAdmittedBody };
