/**
 * SOURCE — mint admission, origin lineage, and logout-all partial failure.
 * Injected verifier results are not live revocation evidence.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  applyLogoutAllWrite,
  bearerFromAuthorizationHeader,
  classifyVerifyFailure,
  continuePendingLogoutAll,
  decideLogoutAllAdmission,
  decideMintAdmission,
  markLogoutComplete,
  originAuthSeconds,
  performLogoutAll,
  sessionAdmitted,
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

function memoryStore() {
  let record: LogoutRecord | null = null;
  return {
    read: async () => record,
    write: async (next: LogoutRecord) => {
      record = next;
    },
    current: () => record,
  };
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

  const store = memoryStore();
  let revokedFor: string | null = null;
  const partial = await performLogoutAll(
    {
      verified: { ...phone, authTimeSeconds: now - 30 },
      operationId: "11111111-1111-1111-1111-111111111111",
      nowSeconds: now,
    },
    {
      read: store.read,
      write: store.write,
      revokeRefreshTokens: async () => {
        throw new Error("admin unavailable");
      },
    }
  );
  check(
    "revoke failure stays pending and is not success",
    partial.ok === false &&
      partial.status === "pending" &&
      store.current()?.revocationState === "pending" &&
      store.current()?.revokedBeforeAuthTimeSeconds === now
  );

  const continuedFail = await continuePendingLogoutAll({
    read: store.read,
    write: store.write,
    revokeRefreshTokens: async () => {
      throw new Error("still unavailable");
    },
  });
  check("pending continuation does not clear the cutoff", continuedFail === "pending");

  const continued = await continuePendingLogoutAll({
    read: store.read,
    write: store.write,
    revokeRefreshTokens: async () => {
      revokedFor = "native-user";
    },
  });
  check(
    "trusted continuation completes without a user token",
    continued === "complete" &&
      revokedFor === "native-user" &&
      store.current()?.revocationState === "complete"
  );

  const again = await performLogoutAll(
    {
      verified: { ...phone, authTimeSeconds: now - 30 },
      operationId: "11111111-1111-1111-1111-111111111111",
      nowSeconds: now,
    },
    {
      read: store.read,
      write: store.write,
      revokeRefreshTokens: async () => {
        throw new Error("must not revoke again");
      },
    }
  );
  check("completed operation id does not revoke again", again.ok && again.status === "complete");

  const raised = markLogoutComplete(
    {
      revokedBeforeAuthTimeSeconds: 9_000,
      revocationState: "pending",
      operationId: "later",
    },
    8_000
  );
  check("completion cannot move the cutoff backward", raised.revokedBeforeAuthTimeSeconds === 9_000);

  const stale = await performLogoutAll(
    { verified: null, operationId: "22222222-2222-2222-2222-222222222222", nowSeconds: now },
    {
      read: async () => {
        throw new Error("must not read");
      },
      write: async () => {
        throw new Error("must not write");
      },
      revokeRefreshTokens: async () => {
        throw new Error("must not revoke");
      },
    }
  );
  check("revoked credential cannot start a new logout-all", stale.ok === false && stale.status === "rejected");

  const monotonic = applyLogoutAllWrite(
    {
      revokedBeforeAuthTimeSeconds: 9_000,
      revocationState: "complete",
      operationId: "old",
    },
    { operationId: "new", nowSeconds: 8_000 }
  );
  check(
    "a new operation keeps the higher cutoff",
    monotonic.record.revokedBeforeAuthTimeSeconds === 9_000 && monotonic.shouldRevoke
  );

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
