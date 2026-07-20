# DELETION ENGINEERING CLOSURE REPORT

**Date:** 2026-07-21  
**Base tip:** `f1019b6`  
**Nature:** Engineering closure of audit gaps D1/D2 (+ related hardening). **Not deployed. Not a legal certification.**

---

## 1. Original gaps

| ID | Gap | Closure in repo |
|----|-----|-----------------|
| D1 | No Storage purge in Functions | **Fixed:** Admin Storage paged purge + verify empty |
| D2 | No Auth `deleteUser` | **Fixed:** Auth delete last, idempotent |
| D3 | Device local residual | **Documented + policy B** (purge after final detection) |
| D5 | Batch starvation | **Mitigated:** loop until empty; job queue paging; lease reclaim |
| Ledger | User doc may vanish mid-job | **Fixed:** `deletionJobs/{uid}` server-only |

---

## 2. State machine

```
active
  → (request) pending_deletion + deletionJobs.awaiting_grace (generation N)
  → [grace 15d] awaiting_grace
  → ready → leased → phases:
        storage → firestore → indexes → auth
  → completed

pending_deletion
  → (reactivation verified) active + deletionJobs.cancelled (generation N+1)
  → purge aborts on generation / status check

needs_manual_review ← permanent errors or attempts ≥ 12
```

**Invariants preserved**

- Grace users are never finally deleted (`grace_not_elapsed` / awaiting_grace).
- Reactivation cancels job; destructive phases re-check generation + `status !== active`.
- Partial failure does not set `completed`.
- Cross-user Storage deletes rejected by ownership gate.
- Retained: `retiredPhones`, retired `ueidIndex`, minimal deleted user stub fields as implemented.

---

## 3. Cleanup order (why recoverable)

1. **Lease** on `deletionJobs/{uid}`  
2. **Storage** purge + verification (Auth still optional)  
3. **Firestore** subcollections until empty  
4. **Indexes** + mark user `deleted` / anonymise PII fields  
5. **Auth** `deleteUser` **last** — if this fails, ledger keeps `auth` pending and cron retries without needing a full profile  

If Storage/Firestore fail earlier → job returns to `ready` (transient) or `needs_manual_review` (permanent). Never marks complete.

---

## 4. Storage paths covered (CODE VERIFIED)

| Prefix | Source |
|--------|--------|
| `users/{uid}/letterhead/` | `userStorage.ts` / `storage.rules` |
| `users/{uid}/attachments/{recordId}/` | same |
| `users/{uid}/pdfs/{recordId}/` | same |

**Not in Storage:** profile logos (device-local only).  
**Not deleted:** any object outside `users/{uid}/…` (untied / shared prefixes).

**Provider soft-delete / versioning / lifecycle:** **EXTERNAL VERIFICATION REQUIRED** in Google Cloud Console — not configured in this repo. Active-object deletion ≠ irreversible erasure if bucket soft-delete is enabled.

---

## 5. Firestore paths covered

Subcollections: `entries`, `professionalPacks`, `letterheadDocs`, `customerCreditRecords`, `purchaseOrders`, `config`, `counters`, `_saveLocks`, `trustedDevices` — looped until empty.

Indexes: `phoneIndex` delete, `retiredPhones` set, `ueidIndex` retired, `emailIndex` marked deleted.

New: `deletionJobs/{uid}` — Admin-only (`firestore.rules`).

---

## 6. Auth behaviour

- `admin.auth().deleteUser(uid)` after data phases.  
- `auth/user-not-found` → idempotent success.  
- Transient failures → retry via ledger.

---

## 7. Retained data (explicit)

- `retiredPhones/{phone}` (anti-abuse)  
- Retired UEID index entries  
- `deletionJobs` completion metadata (no phone/email/record content) — **OWNER CONFIRMATION REQUIRED: TTL**  
- Device data until policy purge / uninstall  
- Shared/exported PDFs outside the app  
- Provider backups / soft-delete windows — **EXTERNAL**

---

## 8. Retry / concurrency

- Lease 5 minutes; expired leases reclaimed by scheduler.  
- Attempts tracked; ≥12 → `needs_manual_review`.  
- Scheduler pages `awaiting_grace`→`ready`, `ready` jobs, legacy pending users.  
- Logs: phase + error **category/code** only (no phone/OTP/filenames with PII).

---

## 9. Local device

See `LOCAL_DEVICE_DELETION_DECISION.md`. Grace retains; final detection purges uid-scoped local data.

---

## 10. Tests run

```
npm run test:storage-paths
npm run test:local-deletion-policy
npm run test:account-deletion-unit
npm run test:reactivation-routing
npm --prefix functions run build
npm run typecheck
```

(+ additional suite batch at commit time)

## Emulator / staging plan (manual)

1. Deploy Functions + indexes to **staging** only (not done in this pass).  
2. Create user → upload letterhead + attachment → request deletion → advance clock / set `graceExpiresAt` past → run scheduler / callable.  
3. Confirm Storage prefixes empty, Auth user gone, job `completed`.  
4. Race: start purge then complete reactivation → job `cancelled`, data retained.  
5. Console: confirm bucket soft-delete settings.

---

## 11. Remaining issues

| Sev | Item |
|-----|------|
| **P1** | Functions/rules/indexes **not deployed** — gap remains in production until deploy |
| **P1** | Bucket soft-delete / backup retention unverified |
| **P2** | `deletionJobs` TTL / counsel retention decision |
| **P2** | Live website delete-account copy still external |
| **P3** | Client best-effort `firebaseServerDeletion` still exists as fallback for non-production paths |

**Repo P0 Storage/Auth omission:** closed in source. **Production residual P1** until deploy + Console verification.
