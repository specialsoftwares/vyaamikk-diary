/**
 * WAVE-1 LABELLED FAKES. Tests only. List/create/detail use GrinApplicationRepository.
 * Team 5: these strings exist so fixtures cannot be mistaken for production
 * adapters, Firestore, SQLite outbox, or Storage.
 */
export const GRIN_FIXTURE_REPOSITORY_LABEL =
  "FAKE / WAVE-1 FIXTURE: GrinFixtureRepository. Tests only. Not a production adapter, not Firestore, not SQLite outbox, not protected Storage originals.";

export const GRIN_FIXTURE_OWNER_UID = "fixture-owner-not-production";
export const GRIN_FIXTURE_LEDGER_ID = "fixture-ledger-not-production";

export const GRIN_PRICING_QUOTA_BLOCKER =
  "GRIN pricing and ordinary-record quota remain unresolved. This Wave 1 fixture does not invent a price, a quota, or an upsell.";
