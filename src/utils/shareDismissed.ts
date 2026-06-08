import { toAppError } from "@/domain/errors";

/** True when the user cancelled the native share sheet (not a real failure). */
export function isShareUserCancelled(error: unknown): boolean {
  const err = toAppError(error);
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("cancel") ||
    msg.includes("dismiss") ||
    msg.includes("did not share") ||
    msg.includes("user denied")
  );
}
