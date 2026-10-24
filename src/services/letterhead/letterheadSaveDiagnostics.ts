/**
 * Privacy-safe stage codes for the letterhead gallery save path.
 * Messages may contain file paths; only the stage and a short code are kept.
 */

export type LetterheadSaveStage = "pick" | "copy" | "sniff" | "crop" | "upload" | "firestore";

export type LetterheadSaveDiagnostic = {
  stage: LetterheadSaveStage;
  outcome: "ok" | "failed";
  code: string;
};

let last: LetterheadSaveDiagnostic | null = null;

export function resetLetterheadSaveDiagnostic(): void {
  last = null;
}

export function lastLetterheadSaveDiagnostic(): LetterheadSaveDiagnostic | null {
  return last;
}

export function recordLetterheadSaveDiagnostic(
  stage: LetterheadSaveStage,
  outcome: "ok" | "failed",
  code: string
): void {
  const safe = code.replace(/[^a-z0-9_:+.-]/gi, "").slice(0, 80) || "failed";
  last = { stage, outcome, code: safe };
}

function httpCode(message: string): string | null {
  const match = message.match(/HTTP (\d{3})/i);
  return match ? `http_${match[1]}` : null;
}

/** Stable code. Never returns a path, URI, or the raw exception text. */
export function describeLetterheadSaveFailure(
  error: unknown,
  stage: LetterheadSaveStage = "upload"
): string {
  if (typeof error === "string") {
    if (error.startsWith("letterhead_stage:")) return error;
    if (/^[a-z0-9_.:-]{1,64}$/i.test(error)) return error;
  }
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("letterhead_stage:")) return message;
  const name = error instanceof Error ? error.name : "";
  const failureCode =
    error && typeof error === "object" && "failureCode" in error
      ? String((error as { failureCode?: unknown }).failureCode ?? "")
      : "";
  if (
    name === "StorageUploadOwnershipError" ||
    failureCode === "session_retired" ||
    message === "session_retired"
  ) {
    return "session_retired";
  }
  if (/^[a-z0-9_.:-]{1,64}$/i.test(message) && !message.includes("file")) return message;
  if (/local file missing/i.test(message)) return "letterhead_stage:upload:local_file_missing";
  if (/local file is empty/i.test(message)) return "letterhead_stage:upload:local_file_empty";
  if (/not signed in/i.test(message)) return "letterhead_stage:upload:not_signed_in";
  if (/image uri is empty/i.test(message)) return "letterhead_stage:upload:empty_image";
  if (/must be a local file/i.test(message)) return "letterhead_stage:upload:unsupported_uri";
  const http = httpCode(message);
  if (http) return `letterhead_stage:upload:${http}`;
  if (stage === "firestore") return "letterhead_stage:firestore:write_failed";
  if (stage === "crop") return "letterhead_stage:crop:crop_failed";
  if (stage === "copy") return "letterhead_stage:copy:read_failed";
  if (stage === "sniff") return "letterhead_stage:sniff:unsupported_format";
  if (stage === "pick") return "letterhead_stage:pick:unavailable";
  return "letterhead_stage:upload:failed";
}
