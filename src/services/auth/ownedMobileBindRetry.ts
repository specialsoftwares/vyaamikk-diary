import { AppError } from "@/domain/errors";

/** Keep the original session/operation claim across all reconciliation retries. */
export async function retryOwnedMobileBind<T>(input: {
  isCurrent: () => boolean;
  bind: () => Promise<T>;
  wait?: (ms: number) => Promise<void>;
}): Promise<T> {
  const assertCurrent = () => { if (!input.isCurrent()) throw new Error("session_changed"); };
  const wait = input.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    assertCurrent();
    try {
      const value = await input.bind();
      assertCurrent();
      return value;
    } catch (error) {
      assertCurrent();
      if (error instanceof Error && error.message === "session_changed") throw error;
      lastError = error;
      if (attempt < 2) { await wait(400 * (attempt + 1)); assertCurrent(); }
    }
  }
  throw new AppError(
    lastError instanceof AppError ? lastError.code : "unknown",
    "Your mobile update could not be confirmed. Check your account before trying again.",
    lastError instanceof Error ? lastError : undefined,
    { purpose: "contact_change", mobileChangeRecoveryRequired: true, authPhase: "post_auth" }
  );
}
