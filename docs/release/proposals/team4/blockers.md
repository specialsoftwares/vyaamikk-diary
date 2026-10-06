# Team 4 — remaining blockers (explicit)

**Do not reopen** GRIN-in-existing-plans (recorded 2026-10-06).

## Owner writes still blank

- **Deletion public window** — three facts: implemented 15 days; owner
  requested 180 days; public policy UNRESOLVED.
  `DELETION_15_VS_180_OWNER_SHEET.md`. A/B/C/D blank. **P8 open.**
- **Storage GiB** — original 1/5/20 vs alternative 256 MiB/1 GiB/5 GiB.
  One choice. `STORAGE_OWNER_CHOICE.md`. Do not advertise.

## Billing / Play (HOLD — not this continue)

- Play catalog / prices / license testers: **NOT RUN**
- `PLAY_BILLING_ENABLED` fail-closed; purchase-entry `"0"`
- No Play products created; no listing Save; no website publish; no submit
- No `520f9f9` AAB; reviewer not fully onboarded on the intended binary
- LIVE_STORE purchase/restore/pending/refund/revocation/account-switch:
  **NOT RUN**
- RTDN Pub/Sub **0**; reconciliation env absent

## Production adapters (unchanged)

List/create/detail bind to `GrinApplicationRepository` (`APPLICATION / WAVE-2`) via GrinOutbox `listForOwner` / `persistDraftAndQueue`. `issuedNumber` stays null until G1 issues it. `GrinFixtureRepository` remains labelled `FAKE` for tests and for amend/QC/EWB/return/pack screens not yet switched.

## Other unresolved (not invented here)

- Live EWB / GSTR-2B / supplier-status integrations (manual + imported observations only)
- Encrypted PDF backup
- Production admission / store-runtime enablement (screens check `isGoodsEvidenceEnabled()`; store-or-standalone stays off)
- Hub tile on Saved Records (proposed only)
- `src/goodsEvidence/index.ts` public exports for the new exception helpers (coordinator-owned)
- Team 1/2 INJECTED outbox ports (queue-only uninjected server until those land)
