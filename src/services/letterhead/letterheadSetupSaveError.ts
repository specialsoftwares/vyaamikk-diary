/**
 * A failed template save must say what went wrong and that the saved
 * template was not replaced. Unknown codes still keep that assurance.
 */

const KNOWN = new Set([
  "need_image",
  "load_failed",
  "session_retired",
  "save_failed",
]);

export function letterheadSetupFailureMessage(input: {
  error: string | null;
  needImage: string;
  loadFailed: string;
  unchanged: string;
}): string | null {
  const error = input.error?.trim() ?? "";
  if (!error) return null;
  const staged = /^letterhead_stage:([a-z]+):([a-z0-9_]+)$/.exec(error);
  if (staged) {
    const stage = staged[1] ?? "save";
    const code = staged[2] ?? "failed";
    const detail =
      code === "local_file_missing"
        ? "The selected image was not available to upload."
        : code.startsWith("http_")
          ? `The upload was rejected (${code}).`
          : `Save stopped during ${stage} (${code}).`;
    return `${detail} ${input.unchanged}`;
  }
  if (error === "need_image") return input.needImage;
  if (error === "load_failed") return input.loadFailed;
  if (error === "session_retired" || error === "save_failed" || KNOWN.has(error)) {
    return input.unchanged;
  }
  if (error.includes(input.unchanged)) return error;
  return `${error} ${input.unchanged}`;
}
