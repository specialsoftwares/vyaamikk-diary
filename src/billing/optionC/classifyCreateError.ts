import { AppError } from "@/domain/errors";

export type AtomicCreateFailureKind =
  | "quota_exhausted"
  | "quota_state_invalid"
  | "permission_denied"
  | "unauthenticated"
  | "network"
  | "unknown";

function firebaseCode(error: unknown): string | null {
  if (error == null || typeof error !== "object" || !("code" in error)) return null;
  const raw = String((error as { code: unknown }).code);
  return raw.replace(/^firestore\//, "").replace(/^storage\//, "");
}

/**
 * Classify a failed atomic create.
 *
 * Firestore `permission-denied` is never treated as quota exhaustion.
 * Known quota exhaustion is only `AppError` with code `quota_exhausted`,
 * thrown after authoritative status+usage reads.
 */
export function classifyAtomicCreateError(error: unknown): AtomicCreateFailureKind {
  const app = unwrapAppError(error);
  if (app) {
    if (app.code === "quota_exhausted") return "quota_exhausted";
    if (app.code === "quota_state_invalid") return "quota_state_invalid";
    if (app.code === "session_expired") return "unauthenticated";
    if (app.code === "permission_denied") return "permission_denied";
    if (app.code === "network") return "network";
    return "unknown";
  }
  const code = firebaseCode(error);
  if (code === "unauthenticated") return "unauthenticated";
  if (code === "permission-denied") return "permission_denied";
  if (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "resource-exhausted" ||
    code === "cancelled"
  ) {
    return "network";
  }
  return "unknown";
}

function unwrapAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  if (error && typeof error === "object" && "cause" in error) {
    const cause = (error as { cause: unknown }).cause;
    if (cause instanceof AppError) return cause;
  }
  return null;
}

export function wrapAtomicCreateFailure(error: unknown): AppError {
  const app = unwrapAppError(error);
  if (app) return app;
  const kind = classifyAtomicCreateError(error);
  if (kind === "unauthenticated") {
    return new AppError("session_expired", "Your session expired. Please log in again.", error);
  }
  if (kind === "network") {
    return new AppError("network", "No internet connection. Please check your network and try again.", error);
  }
  if (kind === "permission_denied") {
    return new AppError(
      "permission_denied",
      "You don't have permission to perform this action.",
      error,
      { reason: "authorization_denied" }
    );
  }
  return new AppError("save_failed", "Couldn't save right now. Please try again.", error);
}
