# DELETION PRODUCTION VERIFICATION RECORD TEMPLATE

**Fill after owner-approved deployment. Do not pre-mark success.**  
**Project must be:** `vyaamikk-diary`  
**Companion plan:** `DELETION_PRODUCTION_DEPLOYMENT_PLAN.md`

---

## A. Deployment metadata

| Field | Value |
|-------|-------|
| Operator name | |
| Date / time (IST) | |
| Git SHA deployed | |
| Firebase project ID (confirmed) | `vyaamikk-diary` / **OTHER (ABORT)** |
| Firebase CLI account email (non-secret) | |
| CLI version | |
| Dry-run performed? | Yes / No |
| Indexes deploy time | |
| Index `deletionJobs(status, graceExpiresAt)` status | Building / Enabled / Error |
| Rules deploy time | |
| Functions deploy time | |
| Scheduler paused during smoke? | Yes / No |

### Deployed functions (asia-south1)

| Function | Revision / version ID | New or updated |
|----------|----------------------|----------------|
| `ensureAccountDeletionJob` | | |
| `completeAccountDeletion` | | |
| `retireIdentity` | | |
| `scheduledDeletionCleanup` | | |
| `completeAccountReactivation` | | |

Storage rules deployed this change? **No (expected)** / Yes (explain)

---

## B. Gate checklist

| Gate | Pass? | Notes |
|------|-------|-------|
| 1 Local tests/build | | |
| 2 Project + auth | | |
| 3 Compatibility | | |
| 4 Storage Console | | |
| 5 IAM / Scheduler | | |
| 6 Diff reviewed | | |
| 7 Deploy | | |
| 8 Functions verified | | |
| 9 Disposable E2E | | |
| 10 Legal reconcile | | |

---

## C. Storage configuration (production bucket)

| Check | Result |
|-------|--------|
| Bucket name | |
| Matches `vyaamikk-diary.firebasestorage.app`? | |
| Location | |
| Soft-delete enabled? Duration | |
| Object versioning | |
| Retention policy / locked? | |
| Lifecycle rules | |
| Backup / replication | |
| Uniform bucket-level access | |
| Encryption (as shown) | |
| Recoverability window after active delete | |

**Policy wording update required?** Yes / No — summary:

---

## D. IAM / Auth Admin

| Check | Result |
|-------|--------|
| Runtime SA can list/delete Storage objects | |
| Runtime SA can `deleteUser` | |
| Scheduler job present and schedule | |
| First post-deploy scheduler run time | |

---

## E. Disposable account tests (redact PII)

### E1 — Request + grace (production OK)

| Step | Pass? | Evidence (redacted) |
|------|-------|---------------------|
| Create disposable identity | | |
| Seed Firestore records | | |
| Upload letterhead / attachment / PDF under `users/{uid}/…` | | |
| Request deletion | | |
| User `pending_deletion`; job `awaiting_grace` | | |
| Access restricted | | |
| Local data retained on device | | |

### E2 — Reactivation cancel (separate disposable)

| Step | Pass? | Evidence |
|------|-------|----------|
| Pending account starts reactivation | | |
| Completes email verification path | | |
| Status `active`; job `cancelled`; generation bumped | | |
| Subsequent purge attempt aborts | | |

### E3 — Final purge (emulator / non-prod OR after real 15 days)

| Step | Pass? | Evidence |
|------|-------|----------|
| Eligibility reached without shortening prod grace improperly | | |
| Storage active objects absent under prefixes | | |
| Firestore user subs empty | | |
| Retained indexes only as designed | | |
| Auth user absent | | |
| Ledger `completed` | | |
| Idempotent re-run | | |
| Device relaunch purges only that uid | | |
| Control account unaffected | | |

### E4 — Failure / manual review (if exercised)

| Step | Pass? | Evidence |
|------|-------|----------|
| Job entered `needs_manual_review` | | |
| Error category/code only (no PII in logs) | | |
| Ops action taken | | |

---

## F. Failures and deviations

| Issue | Severity | Action |
|-------|----------|--------|
| | | |

---

## G. Legal / Play follow-ups

| Item | Done? |
|------|-------|
| Privacy Policy soft-delete / recoverability language | |
| Account deletion disclosure updated on live site | |
| Play Data Safety deletion answers reconciled | |
| `deletionJobs` retention decision recorded | |

---

## H. Final approval

| Statement | Yes/No |
|-----------|--------|
| Production deletion engineering gap considered **closed for runtime** | |
| Remaining provider recoverability disclosed | |
| Approver name | |
| Date | |

**Forbidden claims unless evidence supports:** “permanent”, “irreversible”, “all copies erased instantly”.
