# Packet E — Billing and public-release gates (not this candidate)

Status: **not authorized**. Not started by this closeout.

## Billing (separate programme)

- Client purchase-entry flags stay `"0"` on production and preview EAS profiles.
- Diary SKU Cloud Functions may exist in source; live enablement is **unknown**
  and is not GRIN enablement.
- If users pay through an **existing diary plan**, that is still store billing:
  real-store purchase, acknowledge, entitlement, and GST invoice tests remain
  required. Including GRIN in the current plan does **not** skip Packet E.
- A separate GRIN Play/App Store product is only one possible commercial model
  (Packet D). Real-store work for that SKU is also Packet E, not this candidate.
- Do not reuse GRIN source SHA `dcc325a` or `84c748d` as billing acceptance.

No Play product create, no flag flip, no Functions billing env change from
this packet.

## Public-release gates (18 Oct 2026 target — dates do not override these)

Public Play production (or any unauthenticated store listing that presents GRIN
as a general feature) additionally requires, beyond Internal Testing:

1. Packet D written choice for how customers pay (existing diary plan **or**
   separate GRIN product) **and** Packet E real-store acceptance for that plan.
2. Packet D retention chosen in writing and implemented (delete-with-account
   or retain-for-a-stated-window).
3. Packet D storage quota (per-owner bytes/count) implemented, or
   owner-accepted written residual of technical-ceilings-only — default here
   is **per-owner quota required**.
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
