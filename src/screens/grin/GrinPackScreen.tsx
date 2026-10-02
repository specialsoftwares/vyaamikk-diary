import React from "react";

import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinPackAdmittedBody } from "./GrinPackAdmittedBody";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";
import { useGrinT } from "./grinScreenHooks";

export function GrinPackScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.packTitle")}>
      {(session) => <GrinPackAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

export { GrinPackAdmittedBody };
export { setGrinPackShareForTests } from "./GrinPackAdmittedBody";
