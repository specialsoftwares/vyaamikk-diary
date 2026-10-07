# P8 remaining gap (honest)

**Application:** `540e07aa07f376716484adb879ce66cb9fb170ce`  
**Flag:** `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false` (unchanged; live purge OFF)

## What is already implemented (source + injected)

- 45-day cancellation window (`DELETION_GRACE_MS = 45 * 24 * 60 * 60 * 1000`)
- Independent GRIN purge gate in `runFinalAccountPurge` (does not ride diary phase-done alone)
- GRIN Storage originals/derivatives + Firestore trees inventory and recursive delete
- Owner isolation, interrupted incomplete → retryable, idempotent re-run, completion verification
  (`functions/src/deletion/grinCleanup.unit.test.ts` INJECTED — PASS)
- `accountPurgeMayComplete` refuses completion when flag-true and GRIN incomplete

## Concrete remaining production-path gap

**Operational:** public/account deletion still **omits** live GRIN while the flag is false.
P8 stays **FAIL** operationally until an **explicit owner live grant** flips
`INCLUDE_GRIN_IN_ACCOUNT_PURGE` and purge activation is separately approved.

Do **not** mark deletion complete while GRIN is omitted operationally.
Do **not** flip the flag from this note.
