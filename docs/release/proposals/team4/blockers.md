# Team 4 — remaining blockers (explicit)

## Pricing / quota

GRIN pricing and ordinary-record quota remain unresolved. Screens show `grin.pricingQuotaNote`. No price, quota, or upsell is invented.

## Production adapters

List/create/detail bind to `GrinApplicationRepository` (`APPLICATION / WAVE-2`) via GrinOutbox `listForOwner` / `persistDraftAndQueue`. `issuedNumber` stays null until G1 issues it. `GrinFixtureRepository` remains labelled `FAKE` for tests and for amend/QC/EWB/return/pack screens not yet switched.

## Other unresolved (not invented here)

- Live EWB / GSTR-2B / supplier-status integrations (manual + imported observations only)
- Encrypted PDF backup
- Production admission / store-runtime enablement (screens check `isGoodsEvidenceEnabled()`; store-or-standalone stays off)
- Hub tile on Saved Records (proposed only)
- `src/goodsEvidence/index.ts` public exports for the new exception helpers (coordinator-owned)
- Team 1/2 INJECTED outbox ports (queue-only uninjected server until those land)
