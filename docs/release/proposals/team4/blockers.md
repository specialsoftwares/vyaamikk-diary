# Team 4 — remaining blockers (explicit)

**Do not reopen** GRIN-in-existing-plans (recorded 2026-10-06).

## Owner writes (recorded 2026-10-06)

- **Deletion:** 45-day cancellation window. Implemented 15 until T2. 180
  superseded. Play freeze ≠ delete. `DELETION_45_PLAY_DISCLOSURE.md`.
- **Storage:** 1 / 3 / 10 GiB. Do not advertise. `STORAGE_OWNER_CHOICE.md`.

## Billing / Play (HOLD — not this continue)

- Play catalog / prices / license testers: **NOT RUN**
- `PLAY_BILLING_ENABLED` fail-closed; empty `PLAY_BILLING_TESTER_UIDS` denies
  all; purchase-entry `"0"`
- No Play products created; no listing Save; no website publish; no submit
- LIVE_STORE purchase/restore/pending/refund/revocation/account-switch:
  **NOT RUN**. REAL-CHARGE RISK tests named in
  `RESTRICTED_BILLING_ACCEPTANCE_PLAN.md` — do not execute
- RTDN / androidpublisher inspect: **NOT RUN** (`gcloud` absent)
- Public purchases stay off until a separate approval. GRIN ≠ billing.

## Production adapters (unchanged)

List/create/detail bind to `GrinApplicationRepository` (`APPLICATION / WAVE-2`) via GrinOutbox `listForOwner` / `persistDraftAndQueue`. `issuedNumber` stays null until G1 issues it. `GrinFixtureRepository` remains labelled `FAKE` for tests and for amend/QC/EWB/return/pack screens not yet switched.

## Other unresolved (not invented here)

- Live EWB / GSTR-2B / supplier-status integrations (manual + imported observations only)
- Encrypted PDF backup
- Production admission / store-runtime enablement (screens check `isGoodsEvidenceEnabled()`; store-or-standalone stays off)
- Hub tile on Saved Records (proposed only)
- `src/goodsEvidence/index.ts` public exports for the new exception helpers (coordinator-owned)
- Team 1/2 INJECTED outbox ports (queue-only uninjected server until those land)
