# Packet E — Billing and public-release gates (not this candidate)

Status: **not authorized**. Not started by this closeout.

## Billing (separate programme)

- Client purchase-entry flags stay `"0"` on production and preview EAS profiles.
- Diary SKU Cloud Functions may exist in source; live enablement is **unknown**
  and is not GRIN enablement.
- Real-store purchase, acknowledge, GST invoice for a GRIN SKU (if Packet D
  chooses option B), refund/entitlement mapping: **separate**.
- Do not reuse GRIN source SHA `dcc325a` as billing acceptance.

No Play product create, no flag flip, no Functions billing env change from
this packet.

## Public-release gates (18 Oct 2026 target — dates do not override these)

Public Play production (or any unauthenticated store listing that presents GRIN
as a general feature) additionally requires, beyond Internal Testing:

1. Packet D written choices for pricing (A or B) and retention (A or B
   implemented).
2. Packet D storage quota option B implemented (or owner-accepted written
   residual of A — default here is **B required**).
3. Packet E billing activation if pricing option B.
4. Store-runtime + admission model that does **not** rely on an Internal-only
   admit flag unless production is intentionally invite-only (that is not
   public release).
5. Canonical GitHub `ci:verify` on the public SHA (renderer Docker + joined
   GRIN emulators).
6. Play listing / Data safety / reviewer instructions updated for **actual**
   public behavior (see `PLAY_LISTING_DATA_SAFETY_REVIEWER.md`) and submitted
   only under a later authorization.
7. Device checklist executed on the production-track binary, not only Internal.
8. Main merge authorization (not implied).

Internal Testing success does **not** close these rows.
