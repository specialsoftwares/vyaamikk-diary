/** Share-sheet dismissal is cancellation, not a failed or lost document. */
export function isShareSheetCancellation(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  return /cancell?ed|dismiss|did not share|user did not|E_SHARE_CANCELLED|ERR_CANCELED/i.test(
    message
  );
}
