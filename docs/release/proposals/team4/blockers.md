# Team 4 — remaining blockers (explicit)

## Pricing / quota

GRIN pricing and ordinary-record quota remain unresolved. Wave 1 screens show `grin.pricingQuotaNote` and `GrinFixtureRepository.pricingQuotaBlocker`. No price, quota, or upsell is invented.

## Production adapters

Screens bind to `GrinFixtureRepository` (`FAKE / WAVE-1 FIXTURE`). Wave 2 must replace this with Team 1/2/3 adapters. Team 5 can grep `GrinFixtureRepository` and `GrinFixtureRecord`.

## Other unresolved (not invented here)

- Live EWB / GSTR-2B / supplier-status integrations (manual + imported observations only)
- Encrypted PDF backup
- Production admission / store-runtime enablement (screens check `isGoodsEvidenceEnabled()`; store-or-standalone stays off)
- Hub tile on Saved Records (proposed only)
- `src/goodsEvidence/index.ts` public exports for the new exception helpers (coordinator-owned)
