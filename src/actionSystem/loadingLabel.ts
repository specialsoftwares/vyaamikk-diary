/**
 * Primary/secondary loading should retain action context when a loadingLabel is supplied.
 * Examples: "Save changes" → "Saving…", "Confirm & continue" → "Confirming…"
 */
export function resolveActionLoadingLabel(input: {
  label: string;
  loading?: boolean;
  loadingLabel?: string;
}): string {
  if (!input.loading) return input.label;
  const trimmed = input.loadingLabel?.trim();
  if (trimmed) return trimmed;
  return input.label;
}

/** Whether loading UI should keep label/context beside the spinner. */
export function shouldRetainLoadingContext(input: {
  loading?: boolean;
  loadingLabel?: string;
}): boolean {
  return Boolean(input.loading && input.loadingLabel?.trim());
}
