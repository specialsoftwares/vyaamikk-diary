# Team 2 — owner choice 2026-10-06 (source only)

Branch: `team/grin-t2-owner-choice-1310` (from `team/grin-t2-capacity`).  
Do **not** force-push `origin/team/grin-t2-evidence` or `origin/team/grin-t2-capacity`.  
Combined is coordinator-owned / READ-ONLY. Historical workspace READ-ONLY.  
S1/S2 not reopened. No live deploy. **Advertising is forbidden.**

## SHAs

| Pin | SHA |
|---|---|
| Parent (`team/grin-t2-capacity`) | `2cebe32a8a78dc1928c5abc984a29887ccf7a954` |
| This implementation | this commit on `team/grin-t2-owner-choice-1310` |
| Combined (read-only, same application) | `56f2040` |

## What changed

### A. Storage — third table is live

| Table | Values | Role |
|---|---|---|
| `OWNER_SELECTED_STORAGE_CAPS_BYTES` | Starter **1 GiB** / Professional **3 GiB** / Business **10 GiB** (free 0) | **Live lookup** (`storageCapBytesFromStatus`) |
| `PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES` | Historical **1 / 5 / 20 GiB** | Named, **not** live |
| `OWNER_ALTERNATIVE_STORAGE_CAPS_BYTES` | **256 MiB / 1 GiB / 5 GiB** | Named, **not** live |

`PROPOSED_PENDING_OWNER_CONFIRMATION` is removed from the live lookup. Caps are not advertised. `MAX_STORAGE_HOLDS = 2500` remains a technical entry limit — **not** an unlimited-files promise. Capacity failures keep existing holds; view / download / export remain.

15 MiB-PDF originals fill of **10 GiB** = **682** slots. 682 < 2500; max-id estimator under 1 MiB. No storage redesign. No economics re-research vs `STORAGE_ECONOMICS.md` (advertising remains forbidden).

### B. Explicit deletion — 45-day cancellation window

`DELETION_GRACE_DAYS` / `DELETION_GRACE_MS` = **45 days** in:

- `src/domain/identityLifecycle.ts`
- `functions/src/deletion/finalPurge.ts`

SUPERSEDES 15. **Not 180.** Same clock copied in `functions/src/identity/resolveOrCreateUserByPhone.ts`. Distinct from subscription expiry **90+30** and from optional archive.

Play: freeze ≠ delete. After 45 days the existing `runFinalAccountPurge` path still deletes **non-GRIN** account data (`USER_STORAGE_CATEGORIES` / `USER_SUBCOLLECTIONS` / Auth). `INCLUDE_GRIN_IN_ACCOUNT_PURGE` stays **false**. No production purge job. GRIN omitted from default purge until a separate owner grant.

Inactive cleanup (flag false): nested GRIN, originals, derivatives, reserved original blob, reservations, accounting, retry/interruption, ownership isolation, actual empty verification, child-before-parent. `force: true` is test-only. Default path remains `grin_purge_disabled`.

Public-site HTML (`public-site/privacy.html`, `delete-account.html`) left at 15 days — not a live site deploy.

## Tests (this slice)

| Command | Exit |
|---|---|
| `npx tsx tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts` | **0** |
| `npx tsx tools/goods-evidence-storage/storageQuota.unit.test.ts` | **0** |
| `npx tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | **0** |
| `npx tsx functions/src/deletion/grinCleanup.unit.test.ts` | **0** |
| `npx tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | **0** (P3) |
| `npm run typecheck:goods-evidence-g2` | **0** |
| `npx tsx src/goodsEvidence/entitlementLifecycle.test.ts` | **0** |

Live tests **not run**.

## P3 / P8

| Gate | Status |
|---|---|
| **P3** issuance quota (INJECTED production-register) | **PASS** — `quota.injected.unit.test.ts` exit 0; S1/S2 not reopened |
| **P8** public deletion | **FAIL** — lists exist; not in default `USER_SUBCOLLECTIONS` / `USER_STORAGE_CATEGORIES`; flag false; 180 not implemented; public/Play listing UNRESOLVED |

**Do not advertise** 1/3/10 GiB (or 1/5/20, or 256 MiB/1/5). Do not treat 2500 holds as a customer file allowance. Do not mark GRIN / deletion / public-release Done.
