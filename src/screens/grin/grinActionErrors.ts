import {
  GRIN_MUTATION_QUEUE_UNINJECTED,
  GRIN_NO_CONFIRMED_VERSION,
  isGrinSessionFenceError,
} from "@/services/grin/repository";

export function grinFeatureNotAdmitted(actionable: string | null | undefined): boolean {
  return actionable === "feature_not_admitted";
}

export function grinMutationErrorMessage(
  caught: unknown,
  t: (key: string) => string,
  fallbackKey: string
): { retired: boolean; message: string } {
  if (isGrinSessionFenceError(caught)) {
    return { retired: true, message: t("grin.errSessionRetired") };
  }
  if (caught instanceof Error && caught.message === GRIN_NO_CONFIRMED_VERSION) {
    return { retired: false, message: t("grin.errNoConfirmedVersion") };
  }
  if (caught instanceof Error && caught.message === GRIN_MUTATION_QUEUE_UNINJECTED) {
    return { retired: false, message: t("grin.mutationUnavailable") };
  }
  if (caught instanceof Error && caught.message === "amend_reason_required") {
    return { retired: false, message: t("grin.errAmendReason") };
  }
  if (caught instanceof Error && caught.message === "qc_reason_required") {
    return { retired: false, message: t("grin.errQcReason") };
  }
  if (caught instanceof Error && caught.message === "return_reason_required") {
    return { retired: false, message: t("grin.errReturnReason") };
  }
  return { retired: false, message: t(fallbackKey) };
}
