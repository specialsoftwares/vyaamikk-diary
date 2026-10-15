import type { PreparedReceiptPhoto } from "./preparedReceiptPhoto";
import { hasCashPhotoReference } from "./cashPaidPhotoRef";

export type CashPhotoRecoveryAction = "retry" | "generate_without_photo";

export type CashVoucherPhotoPlan =
  | { status: "ready"; photo: PreparedReceiptPhoto; photoOmitted: boolean }
  | {
      status: "unavailable";
      reason: Extract<PreparedReceiptPhoto, { status: "unavailable" }>["reason"];
      recovery: CashPhotoRecoveryAction[];
    };

const RECOVERY: CashPhotoRecoveryAction[] = ["retry", "generate_without_photo"];

export class ReceiptPhotoUnavailableError extends Error {
  readonly recovery: CashPhotoRecoveryAction[] = RECOVERY;

  constructor(
    public readonly reason: Extract<PreparedReceiptPhoto, { status: "unavailable" }>["reason"]
  ) {
    super(reason);
    this.name = "ReceiptPhotoUnavailableError";
  }
}

/**
 * No-photo vouchers are ready. A referenced photo that is not a prepared
 * data URI must not be treated as a finished image-less document.
 */
export function planCashVoucherPhoto(
  entry: Parameters<typeof hasCashPhotoReference>[0],
  prepared: PreparedReceiptPhoto | null | undefined,
  allowWithoutPhoto = false
): CashVoucherPhotoPlan {
  if (!hasCashPhotoReference(entry)) {
    return { status: "ready", photo: { status: "none" }, photoOmitted: false };
  }
  if (prepared?.status === "ready") {
    return { status: "ready", photo: prepared, photoOmitted: false };
  }
  if (allowWithoutPhoto) {
    return { status: "ready", photo: { status: "none" }, photoOmitted: true };
  }
  const reason = prepared?.status === "unavailable" ? prepared.reason : "missing_local";
  return { status: "unavailable", reason, recovery: RECOVERY };
}
