/**
 * VYD-36 Round 3 — dependency-boundary recovery tests.
 *
 * Round 2 recoverAfterPermissionDenied used ordinary getDoc and would:
 *   A. return existing from a cached record
 *   B. throw quota_exhausted from cached full status/usage
 *   C. treat hasPendingWrites as a committed save
 *   F. swallow a failed getDoc (non-AppError) and rethrow permission_denied
 *
 * These cases fail on that getDoc helper and pass on the server-confirmed
 * coherent-snapshot contract.
 */
import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import { istMonthKeyForMillis } from "@/billing/istMonthKey";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import {
  recoverAfterPermissionDenied,
  type AuthoritativeRecoveryState,
  type RecoverySnapshot,
} from "@/billing/optionC/recoverAfterPermissionDenied";

const NOW_MS = Date.parse("2026-09-15T12:00:00+05:30");
const MONTH = istMonthKeyForMillis(NOW_MS);

const wrapped = new AppError(
  "permission_denied",
  "You don't have permission to perform this action.",
  { code: "permission-denied" },
  { reason: "authorization_denied" }
);

function snap(partial: Partial<RecoverySnapshot> & Pick<RecoverySnapshot, "id">): RecoverySnapshot {
  return {
    exists: false,
    data: undefined,
    ...partial,
    metadata: {
      fromCache: false,
      hasPendingWrites: false,
      ...(partial.metadata ?? {}),
    },
    provenance: partial.provenance ?? "transaction",
  };
}

function accountActive(): RecoverySnapshot {
  return snap({ id: "uid-1", exists: true, data: { status: "active", uid: "uid-1" } });
}

function freeStatus(): RecoverySnapshot {
  return snap({
    id: "status",
    exists: true,
    data: {
      plan: "free",
      billingStatus: "active",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    },
  });
}

function professionalStatus(): RecoverySnapshot {
  return snap({
    id: "status",
    exists: true,
    data: {
      plan: "professional",
      billingStatus: "active",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    },
  });
}

function usageAt(count: number, monthKey = MONTH): RecoverySnapshot {
  return snap({
    id: "usageCurrent",
    exists: true,
    data: {
      monthKey,
      recordsThisMonth: count,
      lastRecordCollection: "purchaseOrders",
      lastRecordId: "po_other",
      updatedAt: NOW_MS,
    },
  });
}

function missingRecord(id = "po_target"): RecoverySnapshot {
  return snap({ id });
}

function committedRecord(id: string, serial = 7): RecoverySnapshot {
  return snap({
    id,
    exists: true,
    data: { id, serial, vendorName: "Winner" },
  });
}

function parsePo(id: string, data: Record<string, unknown>) {
  return { id, ...(data as object) } as { id: string; serial?: number; vendorName?: string };
}

async function recover(state: AuthoritativeRecoveryState, patch: { monthKey?: string; nowMs?: number } = {}) {
  return recoverAfterPermissionDenied({
    recordId: "po_target",
    monthKey: patch.monthKey ?? MONTH,
    nowMs: patch.nowMs ?? NOW_MS,
    parseExisting: parsePo,
    cause: { code: "permission-denied" },
    wrapped,
    readAuthoritative: async () => state,
  });
}

async function expectCode(fn: () => Promise<unknown>, code: AppError["code"]) {
  try {
    await fn();
    assert.fail(`expected ${code}`);
  } catch (e) {
    assert.ok(e instanceof AppError, `expected AppError, got ${String(e)}`);
    assert.equal(e.code, code);
  }
}

async function run(): Promise<void> {
  // A. Cached existing record — Round 2 getDoc would return success.
  const cached = committedRecord("po_target");
  cached.provenance = "untrusted";
  cached.metadata = { fromCache: true, hasPendingWrites: false };
  await expectCode(
    () =>
      recover({
        account: accountActive(),
        record: cached,
        status: freeStatus(),
        usage: usageAt(1),
      }),
    "permission_denied"
  );

  // B. Cached full usage/status — Round 2 would manufacture quota_exhausted.
  const cachedStatus = freeStatus();
  cachedStatus.provenance = "untrusted";
  cachedStatus.metadata = { fromCache: true, hasPendingWrites: false };
  const cachedUsage = usageAt(25);
  cachedUsage.provenance = "untrusted";
  cachedUsage.metadata = { fromCache: true, hasPendingWrites: false };
  await expectCode(
    () =>
      recover({
        account: accountActive(),
        record: missingRecord(),
        status: cachedStatus,
        usage: cachedUsage,
      }),
    "permission_denied"
  );

  // C. Locally pending record must not count as committed.
  const pending = committedRecord("po_target");
  pending.metadata = { fromCache: false, hasPendingWrites: true };
  await expectCode(
    () =>
      recover({
        account: accountActive(),
        record: pending,
        status: freeStatus(),
        usage: usageAt(1),
      }),
    "permission_denied"
  );

  // D. Server-confirmed same-ID winner.
  const got = await recover({
    account: accountActive(),
    record: committedRecord("po_target", 11),
    status: freeStatus(),
    usage: usageAt(25),
  });
  assert.equal(got.outcome, "existing");
  assert.equal(got.serial, null);
  assert.equal(got.record.id, "po_target");
  assert.equal(got.record.serial, 11);

  // E. Server-confirmed final-slot winner for another ID.
  await expectCode(
    () =>
      recover({
        account: accountActive(),
        record: missingRecord("po_target"),
        status: freeStatus(),
        usage: usageAt(25),
      }),
    "quota_exhausted"
  );

  // F. Failed recovery reads preserve a meaningful failure and cause.
  const readErr = { code: "unavailable", message: "backend unavailable" };
  try {
    await recoverAfterPermissionDenied({
      recordId: "po_target",
      monthKey: MONTH,
      nowMs: NOW_MS,
      parseExisting: parsePo,
      cause: { code: "permission-denied" },
      wrapped,
      readAuthoritative: async () => {
        throw readErr;
      },
    });
    assert.fail("expected recovery read failure");
  } catch (e) {
    assert.ok(e instanceof AppError);
    assert.equal(e.code, "network");
    assert.equal(e.details?.reason, "recovery_read_failed");
    assert.equal(e.cause, readErr);
    assert.equal(classifyAtomicCreateError(e), "network");
  }

  // G. Status/usage from one coherent snapshot — unlimited plan + usage 25 is not exhaustion.
  await expectCode(
    () =>
      recover({
        account: accountActive(),
        record: missingRecord(),
        status: professionalStatus(),
        usage: usageAt(25),
      }),
    "permission_denied"
  );

  // G. Same bundle with free cap 25 + usage 25 is exhaustion (compatible versions).
  await expectCode(
    () =>
      recover({
        account: accountActive(),
        record: missingRecord(),
        status: freeStatus(),
        usage: usageAt(25),
      }),
    "quota_exhausted"
  );

  // H. Wrong-month stays permission_denied even if some usage snapshot is full.
  const prev = "2026-08";
  await expectCode(
    () =>
      recover(
        {
          account: accountActive(),
          record: missingRecord(),
          status: freeStatus(),
          usage: usageAt(25, prev),
        },
        { monthKey: prev, nowMs: NOW_MS }
      ),
    "permission_denied"
  );

  // H. Inactive account stays permission_denied even if usage is full.
  await expectCode(
    () =>
      recover({
        account: snap({
          id: "uid-1",
          exists: true,
          data: { status: "pending_deletion", uid: "uid-1" },
        }),
        record: missingRecord(),
        status: freeStatus(),
        usage: usageAt(25),
      }),
    "permission_denied"
  );

  console.log("recoverAfterPermissionDenied.test.ts: ok");
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
