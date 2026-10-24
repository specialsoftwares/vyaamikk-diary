function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function isRetryable(err: unknown): boolean {
  if (!isPlainObject(err)) return false;
  const code = err.code;
  return code === 10 || code === "ABORTED" || code === "aborted";
}
