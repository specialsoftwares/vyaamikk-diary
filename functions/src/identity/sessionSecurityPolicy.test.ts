/**
 * SOURCE — mint admission, origin lineage, and logout-all partial failure.
 * Injected verifier results are not live revocation evidence.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { CALLABLE_SESSION_COVERAGE } from "./callableSessionCoverage";
import {
  bearerFromAuthorizationHeader,
  beginLogoutOperation,
  classifyVerifyFailure,
  continuePendingLogoutAll,
  decideCallableAdmission,
  decideLogoutAllAdmission,
  decideMintAdmission,
  markLogoutComplete,
  originAuthSeconds,
  performLogoutAll,
  sessionAdmitted,
  type AuthSecurityTransaction,
  type LogoutRecord,
} from "./sessionSecurityPolicy";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok - ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function transactionalStore() {
  let record: LogoutRecord | null = null;
  let depth = 0;
  return {
    current: () => record,
    depth: () => depth,
    transact: async <T>(fn: AuthSecurityTransaction<T>): Promise<T> => {
      depth += 1;
      try {
        const result = fn(record);
        if (result.next) record = result.next;
        return result.value;
      } finally {
        depth -= 1;
      }
    },
  };
}

function revokeOutside(store: { depth: () => number }, body: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (store.depth() !== 0) throw new Error("revokeRefreshTokens ran inside a transaction");
    await body();
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function listBackendEntryPoints(): { name: string; kind: string; text: string }[] {
  const root = resolve(process.cwd(), "functions/src");
  const found: { name: string; kind: string; text: string }[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "lib" || name === "node_modules") continue;
        visit(full);
        continue;
      }
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      const text = readFileSync(full, "utf8");
      const re = /export const (\w+) = (onCall|onRequest|onSchedule|wrapGrin)\b/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        found.push({ name: match[1], kind: match[2], text });
      }
    }
  };
  visit(root);
  return found;
}

function handlerSlice(text: string, exportName: string): string {
  const start = text.indexOf(`export const ${exportName}`);
  if (start < 0) return "";
  const next = text.indexOf("\nexport ", start + exportName.length);
  return text.slice(start, next === -1 ? undefined : next);
}

async function main() {
  console.log("session security policy (SOURCE)");

  check("bearer parser ignores a bare token", bearerFromAuthorizationHeader("raw-token") === null);
  check(
    "revoked and disabled verifier codes stay distinct",
    classifyVerifyFailure("auth/id-token-revoked") === "revoked" &&
      classifyVerifyFailure("auth/user-disabled") === "disabled"
  );

  const phone = { uid: "native-user", signInProvider: "phone", authTimeSeconds: 1_000 };
  const minted = decideMintAdmission({ verified: phone, callerUid: "native-user" });
  check("phone credential can mint", minted.ok && minted.originAuthTimeSeconds === 1_000);
  check(
    "caller uid that disagrees with the token is rejected",
    decideMintAdmission({ verified: phone, callerUid: "other-user" }).ok === false
  );
  check(
    "custom-token provider cannot mint again",
    decideMintAdmission({
      verified: { ...phone, signInProvider: "custom" },
      callerUid: phone.uid,
    }).ok === false
  );
  check(
    "missing verification does not mint",
    decideMintAdmission({ verified: null, callerUid: phone.uid }).ok === false
  );

  const preRevocation = originAuthSeconds({
    signInProvider: "custom",
    authTimeSeconds: 2_000,
    originClaim: 1_000,
  });
  check(
    "pre-revocation custom token keeps the native origin",
    preRevocation === 1_000 &&
      sessionAdmitted({ cutoff: 1_500, originSeconds: preRevocation }) === false
  );
  check(
    "redemption auth_time alone would have looked fresh and is not used",
    sessionAdmitted({ cutoff: 1_500, originSeconds: 2_000 })
  );
  check(
    "legacy custom token without an origin claim is denied after a cutoff",
    originAuthSeconds({ signInProvider: "custom", authTimeSeconds: 2_000, originClaim: null }) ===
      0 && sessionAdmitted({ cutoff: 1_500, originSeconds: 0 }) === false
  );
  check(
    "legacy custom token is admitted when no cutoff document exists",
    sessionAdmitted({
      cutoff: null,
      originSeconds: originAuthSeconds({
        signInProvider: "custom",
        authTimeSeconds: 2_000,
        originClaim: null,
      }),
    })
  );
  check(
    "phone session after the cutoff is admitted",
    sessionAdmitted({
      cutoff: 1_500,
      originSeconds: originAuthSeconds({
        signInProvider: "phone",
        authTimeSeconds: 1_501,
        originClaim: null,
      }),
    })
  );
  check(
    "equal-second origin is denied",
    sessionAdmitted({ cutoff: 1_500, originSeconds: 1_500 }) === false
  );

  const now = 5_000;
  check(
    "logout-all requires recent phone auth",
    decideLogoutAllAdmission({ verified: phone, nowSeconds: now }).ok === false
  );
  const recent = decideLogoutAllAdmission({
    verified: { ...phone, authTimeSeconds: now - 30 },
    nowSeconds: now,
  });
  check("recent phone auth may request logout-all", recent.ok);

  const recentPhone = { ...phone, authTimeSeconds: now - 30 };
  const opA = "11111111-1111-4111-8111-111111111111";
  const opB = "22222222-2222-4222-8222-222222222222";
  const store = transactionalStore();
  let revokedFor: string | null = null;
  const partial = await performLogoutAll(
    { verified: recentPhone, operationId: opA, nowSeconds: now },
    {
      transact: store.transact,
      revokeRefreshTokens: revokeOutside(store, async () => {
        throw new Error("admin unavailable");
      }),
    }
  );
  check(
    "revoke failure stays pending and is not success",
    partial.ok === false &&
      partial.status === "pending" &&
      store.current()?.revocationState === "pending" &&
      store.current()?.revokedBeforeAuthTimeSeconds === now &&
      store.current()?.operationId === opA &&
      store.current()?.startedAtSeconds === now
  );

  const continuedFail = await continuePendingLogoutAll({
    transact: store.transact,
    revokeRefreshTokens: revokeOutside(store, async () => {
      throw new Error("still unavailable");
    }),
  });
  check(
    "pending continuation does not clear the cutoff",
    continuedFail === "pending" && store.current()?.revokedBeforeAuthTimeSeconds === now
  );

  const continued = await continuePendingLogoutAll({
    transact: store.transact,
    revokeRefreshTokens: revokeOutside(store, async () => {
      revokedFor = "native-user";
    }),
  });
  check(
    "trusted continuation completes without a user token",
    continued === "complete" &&
      revokedFor === "native-user" &&
      store.current()?.revocationState === "complete" &&
      store.current()?.operationId === opA
  );

  let revokedAgain = false;
  const again = await performLogoutAll(
    { verified: recentPhone, operationId: opA, nowSeconds: now },
    {
      transact: store.transact,
      revokeRefreshTokens: async () => {
        revokedAgain = true;
      },
    }
  );
  check(
    "completed operation id does not revoke again",
    again.ok && again.status === "complete" && revokedAgain === false
  );

  const raised = markLogoutComplete(
    {
      revokedBeforeAuthTimeSeconds: 9_000,
      revocationState: "pending",
      operationId: "later",
      startedAtSeconds: 9_000,
    },
    8_000
  );
  check(
    "completion cannot move the cutoff backward or change the operation",
    raised.revokedBeforeAuthTimeSeconds === 9_000 &&
      raised.operationId === "later" &&
      raised.startedAtSeconds === 9_000
  );

  let rejectedTouched = false;
  const stale = await performLogoutAll(
    { verified: null, operationId: opB, nowSeconds: now },
    {
      transact: async () => {
        rejectedTouched = true;
        throw new Error("must not transact");
      },
      revokeRefreshTokens: async () => {
        rejectedTouched = true;
      },
    }
  );
  check(
    "unverified credential cannot start a new logout-all",
    stale.ok === false && stale.status === "rejected" && rejectedTouched === false
  );

  const kept = beginLogoutOperation(
    {
      revokedBeforeAuthTimeSeconds: 9_000,
      revocationState: "complete",
      operationId: "old",
      startedAtSeconds: 9_000,
    },
    { operationId: "new", nowSeconds: 8_000 }
  );
  check(
    "an older operation leaves the higher cutoff and does not revoke",
    kept.next === null && kept.outcome.action === "leave" && kept.outcome.record.operationId === "old"
  );

  const newer = beginLogoutOperation(
    {
      revokedBeforeAuthTimeSeconds: 9_000,
      revocationState: "complete",
      operationId: "old",
      startedAtSeconds: 8_000,
    },
    { operationId: "new", nowSeconds: 9_000 }
  );
  check(
    "a newer operation keeps the higher cutoff",
    newer.outcome.action === "revoke" &&
      newer.next?.revokedBeforeAuthTimeSeconds === 9_000 &&
      newer.next.operationId === "new" &&
      newer.next.revocationState === "pending"
  );

  const sameSecond = beginLogoutOperation(
    {
      revokedBeforeAuthTimeSeconds: 9_000,
      revocationState: "pending",
      operationId: "old",
      startedAtSeconds: 9_000,
    },
    { operationId: "other", nowSeconds: 9_000 }
  );
  check(
    "a same-second different operation does not replace the current one",
    sameSecond.next === null && sameSecond.outcome.action === "leave"
  );

  const race = transactionalStore();
  let releaseA: () => void = () => undefined;
  const gateA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  let releaseB: () => void = () => undefined;
  const gateB = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  const first = performLogoutAll(
    { verified: recentPhone, operationId: opA, nowSeconds: now },
    {
      transact: race.transact,
      revokeRefreshTokens: revokeOutside(race, async () => {
        await gateA;
      }),
    }
  );
  await flush();
  check(
    "the first request records a pending cutoff before revocation returns",
    race.current()?.operationId === opA && race.current()?.revocationState === "pending"
  );
  const second = performLogoutAll(
    { verified: recentPhone, operationId: opB, nowSeconds: now + 1 },
    {
      transact: race.transact,
      revokeRefreshTokens: revokeOutside(race, async () => {
        await gateB;
      }),
    }
  );
  await flush();
  check(
    "a newer request replaces the operation without lowering the cutoff",
    race.current()?.operationId === opB &&
      race.current()?.revocationState === "pending" &&
      race.current()?.revokedBeforeAuthTimeSeconds === now + 1 &&
      race.current()?.startedAtSeconds === now + 1
  );
  releaseA();
  const firstResult = await first;
  check(
    "the older request does not mark the newer operation complete",
    firstResult.ok === false &&
      firstResult.status === "superseded" &&
      race.current()?.operationId === opB &&
      race.current()?.revocationState === "pending"
  );
  releaseB();
  const secondResult = await second;
  check(
    "the newer request completes only its own operation",
    secondResult.ok &&
      secondResult.status === "complete" &&
      secondResult.operationId === opB &&
      race.current()?.revocationState === "complete"
  );

  const retryStore = transactionalStore();
  await performLogoutAll(
    { verified: recentPhone, operationId: opA, nowSeconds: now },
    {
      transact: retryStore.transact,
      revokeRefreshTokens: async () => {
        throw new Error("first revoke failed");
      },
    }
  );
  let releaseContinue: () => void = () => undefined;
  const continueGate = new Promise<void>((resolve) => {
    releaseContinue = resolve;
  });
  let releaseReplacement: () => void = () => undefined;
  const replacementGate = new Promise<void>((resolve) => {
    releaseReplacement = resolve;
  });
  const continuation = continuePendingLogoutAll({
    transact: retryStore.transact,
    revokeRefreshTokens: revokeOutside(retryStore, async () => {
      await continueGate;
    }),
  });
  await flush();
  const replacement = performLogoutAll(
    { verified: recentPhone, operationId: opB, nowSeconds: now + 2 },
    {
      transact: retryStore.transact,
      revokeRefreshTokens: revokeOutside(retryStore, async () => {
        await replacementGate;
      }),
    }
  );
  await flush();
  releaseContinue();
  const continuationResult = await continuation;
  check(
    "a continuation that loses the race does not complete the newer operation",
    continuationResult === "pending" &&
      retryStore.current()?.operationId === opB &&
      retryStore.current()?.revocationState === "pending" &&
      (retryStore.current()?.revokedBeforeAuthTimeSeconds ?? 0) >= now
  );
  releaseReplacement();
  const replacementResult = await replacement;
  check(
    "the replacement can still complete after the old continuation returns",
    replacementResult.ok &&
      replacementResult.status === "complete" &&
      retryStore.current()?.operationId === opB
  );

  const admitted = decideCallableAdmission({
    verified: phone,
    originClaim: null,
    cutoff: null,
  });
  const denied = decideCallableAdmission({
    verified: { uid: "bridged", signInProvider: "custom", authTimeSeconds: 9_000 },
    originClaim: null,
    cutoff: 1_500,
  });
  check(
    "callable admission uses the origin cutoff",
    admitted.admit && denied.admit === false && denied.reason === "cutoff"
  );

  const entryPoints = listBackendEntryPoints();
  const discovered = new Set(entryPoints.map((entry) => entry.name));
  const covered = new Set(Object.keys(CALLABLE_SESSION_COVERAGE));
  const missing = [...discovered].filter((name) => !covered.has(name));
  const staleCoverage = [...covered].filter((name) => !discovered.has(name));
  check(
    "every backend entry point is classified",
    missing.length === 0 && staleCoverage.length === 0,
    `missing ${missing.join(",")} stale ${staleCoverage.join(",")}`
  );
  let coverageOk = true;
  for (const entry of entryPoints) {
    const decision = CALLABLE_SESSION_COVERAGE[entry.name as keyof typeof CALLABLE_SESSION_COVERAGE];
    const slice = handlerSlice(entry.text, entry.name);
    if (decision === "enforced") {
      const enforced =
        entry.kind === "wrapGrin"
          ? entry.text.includes("await assertAdmittedCallableUser(request)")
          : slice.includes("await assertAdmittedCallableUser(request)");
      if (!enforced) coverageOk = false;
    } else if (slice.includes("assertAdmittedCallableUser")) {
      coverageOk = false;
    }
  }
  check("enforced entry points consult the cutoff and exclusions do not", coverageOk);

  const rtdn = readFileSync(
    resolve(process.cwd(), "functions/src/billing/callables/androidRtdn.ts"),
    "utf8"
  );
  const scheduler = readFileSync(
    resolve(process.cwd(), "functions/src/billing/scheduled/billingReconciliation.ts"),
    "utf8"
  );
  check(
    "RTDN and billing reconciliation do not use the user cutoff",
    !rtdn.includes("authSecurity") &&
      !rtdn.includes("revokeRefreshTokens") &&
      rtdn.includes("oidcVerifier") &&
      !scheduler.includes("logoutAllDevices")
  );
  const download = readFileSync(
    resolve(process.cwd(), "src/services/storage/userStorage.ts"),
    "utf8"
  );
  check(
    "download URLs stay a separate bearer capability",
    download.includes("getDownloadURL")
  );

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all session security policy tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
