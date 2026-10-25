/**
 * Phone OTP may show email as soon as the account transaction returns.
 * The bridge promise is started and not awaited. Duration 0 spans are
 * ordering evidence, not device timings.
 */

import { beginPerfAttempt, recordPerfSpan } from "./authFlowPerf";

export async function afterPhoneIdentityResolved<T>(input: {
  resolveAccount: () => Promise<T>;
  beginBridge: () => Promise<boolean>;
}): Promise<T> {
  const account = await input.resolveAccount();
  void input.beginBridge().catch(() => false);
  recordPerfSpan({
    ...beginPerfAttempt("navigation"),
    stage: "ui_feedback",
    runtime: "js",
    durationMs: 0,
    outcome: "ok",
    evidence: "ordering",
  });
  return account;
}
