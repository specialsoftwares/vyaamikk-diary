import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import { sanitizeLogMetadata } from "@/utils/safeDiagnostics";

import { createReactivationEmailVerification } from "./reactivationEmailVerification";

const PROFILE = { uid: "uid-synthetic", status: "active" } as UserProfile;
const CODE = "010203";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function harness(overrides: {
  code?: string;
  online?: boolean;
  isCurrent?: () => boolean;
  complete?: (challengeId: string, code: string) => Promise<UserProfile>;
  finish?: (profile: UserProfile, stillCurrent: () => boolean) => Promise<void>;
  readAccount?: () => Promise<
    { status: "active"; profile: UserProfile } | { status: "pending_deletion" } | { status: "unknown" }
  >;
  timeoutMs?: number;
}) {
  const calls: string[] = [];
  const records: Array<{ outcome: string; stage: string; attemptId: string }> = [];
  const controller = createReactivationEmailVerification();
  const submit = () =>
    controller.submit({
      code: overrides.code ?? CODE,
      challengeId: "challenge-synthetic",
      online: overrides.online ?? true,
      isCurrent: overrides.isCurrent ?? (() => true),
      complete: overrides.complete ?? (async (_id, code) => {
        calls.push(code);
        return PROFILE;
      }),
      finish: overrides.finish ?? (async () => {
        calls.push("finish");
      }),
      readAccount: overrides.readAccount ?? (async () => ({ status: "pending_deletion" })),
      messageFor: (error) => (error instanceof AppError ? String(error.details?.code ?? error.message) : "rejected"),
      offlineMessage: "offline",
      unknownMessage: "unknown-result",
      localFailureMessage: "local-failed",
      timeoutMs: overrides.timeoutMs ?? 40,
      now: () => 1_700_000_000_000,
      record: (event) => records.push(event),
    });
  return { controller, submit, calls, records };
}

async function main() {
  const leading = harness({});
  const leadingView = await leading.submit();
  assert.equal(leadingView.outcome, "verified");
  assert.equal(leadingView.busy, false);
  assert.equal(leadingView.navigate, true);
  assert.deepEqual(leading.calls, [CODE, "finish"]);
  assert.notEqual(String(Number(CODE)), CODE);

  for (const serverCode of ["invalid", "expired", "superseded"] as const) {
    let finished = false;
    const wrong = harness({
      complete: async () => {
        throw new AppError("invalid_otp", "no", undefined, { code: serverCode });
      },
      finish: async () => {
        finished = true;
      },
    });
    const view = await wrong.submit();
    assert.equal(view.outcome, "rejected", serverCode);
    assert.equal(view.busy, false, serverCode);
    assert.equal(view.navigate, false, serverCode);
    assert.equal(view.error, serverCode, serverCode);
    assert.equal(finished, false, serverCode);
  }

  const rejected = harness({
    complete: async () => {
      throw new AppError("network", "unavailable");
    },
  });
  const rejectedView = await rejected.submit();
  assert.equal(rejectedView.outcome, "rejected");
  assert.equal(rejectedView.busy, false);
  assert.equal(rejectedView.error, "unavailable");

  const hung = harness({
    complete: () => new Promise(() => undefined),
    readAccount: async () => ({ status: "pending_deletion" }),
  });
  const hungView = await hung.submit();
  assert.equal(hungView.outcome, "unknown");
  assert.equal(hungView.busy, false);
  assert.equal(hungView.navigate, false);
  assert.equal(hungView.error, "unknown-result");
  assert.equal(hung.calls.includes("finish"), false);

  const lost = harness({
    complete: () => new Promise(() => undefined),
    readAccount: async () => ({ status: "active", profile: PROFILE }),
  });
  const lostView = await lost.submit();
  assert.equal(lostView.outcome, "verified");
  assert.equal(lostView.navigate, true);
  assert.deepEqual(lost.calls, ["finish"]);

  let finishCalls = 0;
  const local = harness({
    finish: async () => {
      finishCalls += 1;
      if (finishCalls === 1) throw new Error("key-unavailable");
    },
    readAccount: async () => ({ status: "active", profile: PROFILE }),
  });
  const localView = await local.submit();
  assert.equal(localView.outcome, "local_failed");
  assert.equal(localView.busy, false);
  assert.equal(localView.navigate, false);
  assert.equal(local.calls.filter((call) => call === CODE).length, 1);
  const retried = await local.submit();
  assert.equal(retried.outcome, "verified");
  assert.equal(local.calls.filter((call) => call === CODE).length, 1);
  assert.equal(finishCalls, 2);

  let cacheFinishes = 0;
  let cacheCompletes = 0;
  const cached = harness({
    complete: async () => {
      cacheCompletes += 1;
      return PROFILE;
    },
    finish: async () => {
      cacheFinishes += 1;
      throw new Error("local");
    },
    readAccount: async () => ({ status: "unknown" }),
  });
  const cachedFirst = await cached.submit();
  assert.equal(cachedFirst.outcome, "local_failed");
  assert.equal(cachedFirst.navigate, false);
  const cachedSecond = await cached.submit();
  assert.equal(cachedSecond.outcome, "unknown");
  assert.equal(cachedSecond.navigate, false);
  assert.equal(cacheCompletes, 1);
  assert.equal(cacheFinishes, 1);

  const gate = deferred<UserProfile>();
  let current = true;
  let duplicateCompletes = 0;
  const shared = harness({
    isCurrent: () => current,
    complete: async (_id, code) => {
      duplicateCompletes += 1;
      assert.equal(code, CODE);
      return gate.promise;
    },
  });
  const first = shared.submit();
  const second = await shared.submit();
  assert.equal(second.outcome, "ignored");
  assert.equal(second.apply, false);
  current = false;
  gate.resolve(PROFILE);
  const signedOut = await first;
  assert.equal(signedOut.outcome, "stale");
  assert.equal(signedOut.busy, false);
  assert.equal(signedOut.navigate, false);
  assert.equal(duplicateCompletes, 1);
  assert.equal(shared.calls.includes("finish"), false);

  const lateGate = deferred<UserProfile>();
  let published = false;
  const late = harness({
    complete: () => lateGate.promise,
    finish: async (_profile, still) => {
      if (!still()) return;
      published = true;
    },
  });
  const lateSubmit = late.submit();
  late.controller.retire();
  lateGate.resolve(PROFILE);
  const lateView = await lateSubmit;
  assert.equal(lateView.outcome, "stale");
  assert.equal(lateView.navigate, false);
  assert.equal(published, false);

  const safe = sanitizeLogMetadata({
    attemptId: leading.records[0]?.attemptId,
    kind: "unknown",
    reactivationStage: "account",
    ms: 20,
    callableName: "completeAccountReactivation",
    phoneE164: "+919800000001",
    code: CODE,
    verificationId: "challenge-synthetic",
    uid: "uid-synthetic-full",
  });
  assert.equal(safe?.ms, 20);
  assert.equal(safe?.callableName, "completeAccountReactivation");
  assert.equal("phoneE164" in (safe ?? {}), false);
  assert.equal("code" in (safe ?? {}), false);
  assert.equal("verificationId" in (safe ?? {}), false);
  assert.equal("uid" in (safe ?? {}), false);
  assert.equal(String(safe?.attemptId ?? "").includes("uid-synthetic"), false);

  console.log("reactivationEmailVerification.test.ts: ok");
}

void main();
