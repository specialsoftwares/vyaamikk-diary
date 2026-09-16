import type { BusinessEntry } from "@/domain/businessEntry";
import { updateEntryLocalFirst, type LocalFirstWriteResult } from "./localFirst";
import { runRecordStepIfNeeded } from "@/services/records/saveCoordinator";
import { SAVE_STEP } from "@/services/records/saveLockTypes";

/** True only when this write's payload was accepted remotely — not merely remoteConfirmed. */
export function composerSecondaryWriteReachedCloud(result: LocalFirstWriteResult): boolean {
  return result.remoteAccepted === true;
}

export async function attachComposerPdfUri(params: {
  userId: string;
  entryId: string;
  pdfUri: string;
  completedSteps: string[];
  clientRecordId?: string;
}): Promise<{
  entry: BusinessEntry;
  completedSteps: string[];
  remoteAccepted: boolean;
  failureKind?: LocalFirstWriteResult["failureKind"];
}> {
  const write = await updateEntryLocalFirst(params.userId, {
    id: params.entryId,
    pdfUri: params.pdfUri,
  });
  if (!composerSecondaryWriteReachedCloud(write)) {
    return {
      entry: write.entry,
      completedSteps: params.completedSteps,
      remoteAccepted: false,
      failureKind: write.failureKind,
    };
  }
  const uriStep = await runRecordStepIfNeeded(
    {
      userId: params.userId,
      recordKind: "business_entry",
      recordId: params.entryId,
      step: SAVE_STEP.PDF_URI_SAVED,
      completedSteps: params.completedSteps,
      clientRecordId: params.clientRecordId,
    },
    async () => write.entry
  );
  return {
    entry: write.entry,
    completedSteps: uriStep.completedSteps,
    remoteAccepted: true,
  };
}
