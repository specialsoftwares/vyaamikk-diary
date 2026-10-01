import React from "react";

import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinAttachmentsAdmittedBody } from "./GrinAttachmentsAdmittedBody";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";
import { useGrinT } from "./grinScreenHooks";

export function GrinAttachmentsScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.attachmentsTitle")}>
      {(session) => <GrinAttachmentsAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

export { GrinAttachmentsAdmittedBody };
