# DELETION PRODUCTION DEPLOYMENT PLAN

**Status after this audit:** `BLOCKED`  
**Base range:** `f1019b6` → `6f397d3` (includes `9b19c9e`, `6f397d3`)  
**Required Firebase project:** `vyaamikk-diary`  
**Date:** 2026-07-21  
**Nature:** Read-only deployment-readiness. **No deployment, push, or Console mutation occurred in this pass.**

This document is not a legal opinion and does not close the production deletion gap until Gates 2–10 are completed and recorded.

---

## 0. Verdict summary

| Gate | Result |
|------|--------|
| 1 Local tests + Functions build | **PASS** (re-run this pass) |
| 2 Firebase target + authenticated account | **BLOCKED** — CLI credentials expired (`firebase login --reauth` required); `firebase use` locally shows `vyaamikk-diary` |
| 3 Pre-existing job compatibility | **PASS (code analysis)** — see §4; no crash-class defect found for legacy `pending_deletion` users |
| 4 Storage bucket / soft-delete Console | **BLOCKED** — owner Console verification required |
| 5 IAM + scheduler APIs | **BLOCKED** — owner Console verification required |
| 6 Exact deploy diff reviewed | **PASS (repo)** — inventory below |
| 7 Deploy | **NOT EXECUTED** (prohibited this pass) |
| 8 Post-deploy function verification | **NOT EXECUTED** |
| 9 Disposable E2E | **NOT EXECUTED** |
| 10 Legal / Play disclosure reconcile | **PARTIAL** — drafts updated in repo; live site / Play form still owner |

**Overall:** `BLOCKED` until Gate 2 (CLI reauth + project confirmation) and Gates 4–5 (Console Storage + IAM) clear. After those, status may become `READY FOR OWNER-APPROVED DEPLOYMENT`.

---

## 1. Changed resource inventory

### 1.1 Cloud Functions (Gen2, codebase `default`)

All deletion-related callables/schedulers use **`region: "asia-south1"`**.  
Explicit `memory`, `timeoutSeconds`, `concurrency`, and `secrets` are **not** set in source → Firebase **platform defaults** apply (EXTERNAL confirm in Console after deploy).

| Export name (deployed name) | Trigger | Change | Notes |
|-----------------------------|---------|--------|-------|
| `ensureAccountDeletionJob` | HTTPS callable | **NEW** | Creates/refreshes `deletionJobs/{uid}` after pending |
| `completeAccountDeletion` | HTTPS callable | **MODIFIED** | Now runs `runFinalAccountPurge` (Storage→Firestore→indexes→Auth) |
| `retireIdentity` | HTTPS callable | **MODIFIED** | Same purge pipeline (compat entry) |
| `scheduledDeletionCleanup` | Schedule `every 24 hours` | **MODIFIED** | Promotes jobs, bootstraps legacy users, leases, purge |
| `completeAccountReactivation` | HTTPS callable | **MODIFIED** | Cancels `deletionJobs` after status→active |
| `startAccountReactivation` | HTTPS callable | Unchanged behaviour for cancel | No deletionJobs write on start |
| Other identity/email/mint exports | — | **Unchanged** | Must **not** be force-redeployed unless intentional |

**Removed / renamed functions:** None. No obsolete function name left behind by rename.

**Generation:** Cloud Functions Gen 2 (`firebase-functions` v6 / `onCall` / `onSchedule` v2 APIs).

**Runtime (from `functions/package.json`):** Node **20**.  
**Admin SDK:** `firebase-admin@13.x` (local install reported `13.10.0`).  
**Compatibility risk:** Node 20 + Admin 13 is current for Gen2; do **not** upgrade in this pass. Confirm Console runtime still Node 20 after deploy.

### 1.2 Scheduler / event dependencies

| Item | Value |
|------|--------|
| Function | `scheduledDeletionCleanup` |
| Schedule | `every 24 hours` |
| Region | `asia-south1` |
| Timezone | Platform default for `every 24 hours` (not explicitly set) — **EXTERNAL confirm** |
| Underlying | Cloud Scheduler + Pub/Sub (Gen2) — APIs must exist in project |
| Service account | Default compute/App Engine / Functions runtime SA — **EXTERNAL confirm** |

**Immediately after deploy:** the next scheduler tick (or a manual run) **can** process any `users` with `status == pending_deletion` whose grace has already elapsed, bootstrapping `deletionJobs` and running full purge including Storage + Auth. This is intentional but operationally material.

### 1.3 Firestore rules

| Change | Deploy required? |
|--------|------------------|
| New `match /deletionJobs/{uid} { allow read, write: if false; }` | **YES** — server-only ledger; deploy with Functions that write the collection |

Unrelated rule bodies: unchanged; still deploy as single ruleset file.

### 1.4 Firestore indexes

| Change | Deploy required? |
|--------|------------------|
| Composite: `deletionJobs` `status` ASC + `graceExpiresAt` ASC | **YES** — required for scheduler promote query |

**Order:** Deploy indexes **before** (or with) Functions; wait until index status is **Enabled** before relying on promote query. Legacy user bootstrap query (`users` where `status == pending_deletion`) does not need this composite and remains a fallback path.

### 1.5 Storage rules

| Change f1019b6→6f397d3 | Deploy required? |
|------------------------|------------------|
| **None** (git diff empty) | **NO** — do not deploy `storage` in this rollout unless separately intended |

### 1.6 Supporting build outputs

- `functions/lib/**` built by `npm --prefix functions run build`
- Unit tests excluded from compile (`*.unit.test.ts` / `*.test.ts`)
- Bundle check: exports include `ensureAccountDeletionJob`, `completeAccountDeletion`, `retireIdentity`, `scheduledDeletionCleanup`, `completeAccountReactivation`; **no** unit-test JS in `lib/deletion/`; no obvious secrets scanned in `lib/`

### 1.7 Must NOT deploy (unrelated)

- Hosting / Lovable website  
- Storage rules (unchanged)  
- Unrelated Functions (identity OTP, email, mint) **unless** owner chooses full codebase deploy  
- App Check, Remote Config, Extensions  
- Production data mutations outside Functions’ own deletion behaviour  
- Package / runtime upgrades  

### 1.8 Billing / behaviour impact

| Impact | Assessment |
|--------|------------|
| Invocation volume | Scheduler still daily; each eligible job may list/delete many Storage objects + Firestore batches → **higher per-job cost** vs prior Firestore-only purge |
| Permissions | Needs Storage object Admin delete + Auth Admin deleteUser (see §6) |
| Production data | Eligible grace-elapsed accounts will receive **stronger** erasure (Storage + Auth) than before |
| Grace period | **Unchanged** 15 days |

---

## 2. Firebase targeting evidence

### 2.1 `.firebaserc`

```json
"projects": { "production": "vyaamikk-diary" }
```

### 2.2 Active project (this machine, this pass)

- `firebase use` → `vyaamikk-diary`  
- `firebase projects:list` / `functions:list` → **FAILED** — credentials no longer valid  

### 2.3 Owner confirmation commands (non-secret)

```bash
firebase login --reauth
firebase use
# expect: vyaamikk-diary

firebase use production
# alias → vyaamikk-diary

firebase projects:list
# confirm vyaamikk-diary is listed and selected

firebase functions:list --project vyaamikk-diary
gcloud config get-value project
# if used: must be vyaamikk-diary
```

**P0:** Deploying to any other project ID is prohibited.

---

## 3. Exact proposed deployment commands (Gate 7 — do not run until gates clear)

Prefer **minimum set**, indexes first:

```bash
# Preflight
firebase use
# MUST print: vyaamikk-diary

firebase deploy --only firestore:indexes --project vyaamikk-diary --dry-run
firebase deploy --only firestore:indexes --project vyaamikk-diary

# Wait until Console shows deletionJobs composite index Enabled

firebase deploy --only firestore:rules --project vyaamikk-diary --dry-run
firebase deploy --only firestore:rules --project vyaamikk-diary

firebase deploy --only \
  functions:ensureAccountDeletionJob,\
functions:completeAccountDeletion,\
functions:retireIdentity,\
functions:scheduledDeletionCleanup,\
functions:completeAccountReactivation \
  --project vyaamikk-diary --dry-run

firebase deploy --only \
  functions:ensureAccountDeletionJob,\
functions:completeAccountDeletion,\
functions:retireIdentity,\
functions:scheduledDeletionCleanup,\
functions:completeAccountReactivation \
  --project vyaamikk-diary
```

**Do not** include `storage` in this rollout.

**Optional pause before first scheduler tick:** In Google Cloud Console → Cloud Scheduler, pause the job bound to `scheduledDeletionCleanup` until disposable smoke checks for request/reactivation complete; then resume. (Exact Scheduler job name is Console-assigned — EXTERNAL.)

---

## 4. Backward-compatibility analysis (mandatory)

There was **no** production `deletionJobs` collection before this change. Prior state = `users/{uid}.status` / grace timestamps only.

| Pre-existing situation | New worker behaviour | Safe? |
|------------------------|----------------------|-------|
| `pending_deletion`, grace **not** elapsed, no job | Scheduler skips user until grace; `ensureAccountDeletionJob` creates `awaiting_grace` | Yes |
| `pending_deletion`, grace **elapsed**, no job | Scheduler bootstraps job from user doc → full purge | Yes — **will run Storage+Auth** |
| Partially purged by **old** client/Admin path (subs deleted, user still pending/deleted), no job | Bootstrap + phases from empty → Storage/Auth still attempted; Firestore verify empty succeeds | Yes |
| User already `deleted` stub, Auth/Storage leftovers, no job | Bootstrap allows `deleted` status → continues remaining phases | Yes |
| Reactivated (`active`), stale deletion fields cleared by old code | No job / cancel no-op; purge requires pending/deleted | Yes |
| Reactivated after new code | `cancelDeletionJob` + generation bump; purge aborts | Yes |
| Missing Storage prefix | Verify empty → success | Yes |
| Auth user already absent | Idempotent success | Yes |
| Large paginated Storage | Paged list/delete + verify passes | Yes |
| `needs_manual_review` | Not auto-retried every minute; stays until ops | Yes |
| Old job doc with **missing phase fields** | N/A at first deploy (collection new). If a malformed doc appears later, `job.phases` spread could be undefined — **mitigation:** first writes always use `initialDeletionJob` / ensure; treat hand-edited docs as ops risk | Acceptable |

**No pre-existing document schema was found that would crash the worker on deploy** for the legacy `users.pending_deletion` path.  
**Operational note:** Any grace-elapsed pending accounts become eligible for **stronger** deletion immediately after scheduler runs — inventory them in Console before deploy if needed.

**Do not** manually mass-delete or rewrite production user docs without a separate approved migration. Compatibility plan is: **bootstrap-from-user**, not rewrite-in-place of historical ledgers.

---

## 5. IAM / runtime authorisation checklist (Console — do not grant in this pass)

Default Firebase/Google Cloud Functions runtime service account typically needs:

| Capability | Why | Verification |
|------------|-----|--------------|
| Firestore read/write | users, indexes, deletionJobs, retiredPhones | Already used by existing Functions |
| Storage object list/delete on app bucket | `getAdminBucket()` + `getFiles`/`delete` | Confirm SA has access to `vyaamikk-diary.firebasestorage.app` (or current default bucket) |
| Firebase Auth Admin `deleteUser` | Final phase | Confirm Auth Admin API enabled + SA permission |
| Cloud Scheduler invoke | `scheduledDeletionCleanup` | Confirm scheduler job exists post-deploy |
| Token Creator (if mint custom tokens elsewhere) | Existing mint function — not new here | Already a known prerequisite |

**Do not claim access exists merely because TypeScript builds.**

---

## 6. Cloud Storage Console verification checklist

**Expected bucket name (from repo `google-services.json` `storage_bucket`):**  
`vyaamikk-diary.firebasestorage.app`  

Confirm in Console that Functions’ default bucket matches this name.

| Check | Record | Policy implication |
|-------|--------|--------------------|
| Exact bucket name | | Must match purge target |
| Location | | Disclosure / transfer wording |
| Soft-delete policy + duration | | Must **not** say irreversible if recoverable |
| Object versioning | | Non-current versions may remain |
| Retention policy (locked?) | | May **block** deletes — P0 if locked retention prevents purge |
| Lifecycle rules | | May delay true removal |
| Backup / replication | | Disclose provider retention |
| Default encryption | | Only claim what Console shows |
| Uniform bucket-level access | | Ops note |
| Storage Rules deployment state | | Unchanged this pass |
| Deleted object recoverability window | | Drive Privacy/deletion disclosure language |
| Download URL after active delete | | Expect 404 for active object; soft-delete may differ |
| All paths `users/{uid}/letterhead\|attachments\|pdfs/` in **same** bucket | | Required |

---

## 7. `deletionJobs` lifecycle / TTL

| Field examples | Contains PII business content? |
|----------------|--------------------------------|
| `uid`, `generation`, `status`, phase statuses, `attempts`, `lastErrorCategory`, `lastErrorCode`, timestamps, lease metadata | **No** phone/email/OTP/record payloads by design |

- **Client access:** denied by rules (`allow read, write: if false`)  
- **TTL:** **none implemented** — do not add in this pass  
- **OWNER/COUNSEL:** decide retention of completed ledger docs  
- Future Firestore TTL ≠ account deletion deadline; never market TTL as the 15-day grace substitute  

---

## 8. Rollout gates (explicit)

1. **Gate 1** — Local tests/build PASS (this pass).  
2. **Gate 2** — `firebase login --reauth`; `firebase use` = `vyaamikk-diary`.  
3. **Gate 3** — Compatibility analysis accepted; optionally list grace-elapsed pending users.  
4. **Gate 4** — Storage checklist complete; no locked retention blocking deletes.  
5. **Gate 5** — IAM + Scheduler APIs confirmed.  
6. **Gate 6** — Commands in §3 reviewed by owner.  
7. **Gate 7** — Deploy indexes → rules → functions (dry-run then live).  
8. **Gate 8** — `functions:list` shows new/updated revisions in `asia-south1`.  
9. **Gate 9** — Disposable verification (§9).  
10. **Gate 10** — Privacy / deletion disclosure / Play answers match soft-delete facts.

---

## 9. Production vs emulator verification strategy

**Do not shorten production grace.**

| Environment | Use for |
|-------------|---------|
| **Emulator** / non-prod project | Accelerate final purge, Storage empty check, Auth delete, idempotent retry, reactivation race |
| **Production disposable account** | Request deletion, grace restrictions, session sign-out, local retain; reactivation cancel on a **second** disposable account; **final** purge only after real 15 days **or** documented authorised server-side test (not added this pass) |

### Final deletion matrix (evidence)

1. Create disposable identity  
2. Create Firestore records  
3. Upload letterhead, attachment, PDF under UID prefixes  
4. Request deletion → `pending_deletion` + job `awaiting_grace`  
5. Verify grace restrictions + local data retained  
6. Separate account: reactivate during grace → job `cancelled`  
7. Non-prod: force eligibility / wait  
8. Storage prefixes empty (active objects)  
9. User-owned Firestore subs empty  
10. Only intended retained indexes (`retiredPhones`, retired UEID)  
11. Auth user absent  
12. Ledger `completed` or `needs_manual_review`  
13. Re-run purge → idempotent  
14. Relaunch device → only that UID local purged  
15. Other account intact  

Capture: redacted Console screenshots, function logs (no phone/OTP/tokens), object-prefix counts, Auth lookup, ledger doc.

---

## 10. Rollback / pause

1. **Pause** Cloud Scheduler job for `scheduledDeletionCleanup`.  
2. Optionally disable/redeploy previous Functions revisions from Console release history.  
3. Firestore rules/indexes: reverting rules removes client denial on `deletionJobs` only if rolled back — Admin still owns data; prefer keep deny-all.  
4. Already-completed purges are **not** undoable from app Storage/Auth deletes.  

---

## 11. Expected behaviour immediately after successful deploy

- New deletion requests can call `ensureAccountDeletionJob`.  
- Reactivation cancels jobs.  
- Within ≤24h (or on manual scheduler run), grace-elapsed pending users begin full purge including Storage + Auth.  
- Soft-deleted GCS objects may remain recoverable per Console policy.  

---

## 12. Remaining P0/P1

| Sev | Item |
|-----|------|
| **P0** | Deploy to wrong project — prevented by process; CLI reauth required before any deploy |
| **P0** | Locked bucket retention preventing deletes — Console unknown |
| **P1** | CLI credentials expired (this environment) |
| **P1** | Storage soft-delete / IAM unverified |
| **P1** | Production gap remains until Gate 7–9 complete |

---

## 13. Confirmation

- Tests/builds re-run: **yes** (Gate 1).  
- Deployment executed: **no**.  
- Push: **no**.  
- Production data / Console settings altered: **no**.  
- Protected local files untouched: **yes**.
