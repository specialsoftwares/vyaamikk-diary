# GRIN finite closure checklist (release candidate)

Not G6 completion. Not Wave 2 acceptance. Forbidden matrix row statuses
(`complete` / `accepted` / `pass` / `done` / `approved`) are **not** used here.

Historical row-by-row matrix: `docs/release/GRIN_ACCEPTANCE_MATRIX.md`
(many G2 rows still say `tbd` and are **stale vs source**). Do not treat that
file as the operational gate. This checklist is the finite closeout list.

Application SHA in scope: `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a`.
Evidence labels: `source`, `injected`, `SQLITE_HOST`, `emulator`, `native device`,
`play-installed`.

## Source (reviewed scope)

| ID | Item | Evidence | Gate | Status |
|---|---|---|---|---|
| S1 | Register/reconcile/mutate/read JS transport + fail-closed unexported Functions | source + emulator | source | closed at labelled hosts |
| S2 | Bounded FileHandle original reads; no production full-file atob path | source + SQLITE_HOST | source | closed at labelled hosts; not native memory |
| S3 | Stored-byte verify; client hash is a claim | emulator | source | closed at labelled hosts |
| S4 | Post-upload confirmation refresh; failed read stays `attachment_pending` / `confirmation_refresh`; no second serial; completion fenced after awaits | source + SQLITE_HOST + emulator | source | closed at labelled hosts (`dcc325a`); do not reopen without new repro |
| S5 | Pack export is summary; `originalsBundled=false`; ITC `not_determined` | emulator + SQLITE_HOST | source | closed at labelled hosts |
| S6 | GRIN default-off; store-runtime block; purchase-entry `"0"`; legal date `2026-07-27` | source | source | still true |
| S7 | Production Admin compose + `index.ts` GRIN exports | source | **deployment** | **open** — adapters still under `tools/` |
| S8 | Canonical GitHub `ci:verify` (renderer Docker + joined GRIN emulators) | GitHub Actions | source/CI | **open** — no combined PR; local Docker-skipped run is not this row |

## Deployment

| ID | Item | Gate | Status |
|---|---|---|---|
| D1 | Fresh live Rules export; merge GRIN matchers into live-compat Firestore/Storage, not repo-root quota Rules | deployment | proposal only (Packet A) |
| D2 | Seven callables in `asia-south1` on `vyaamikk-diary`; env `"true"` | deployment | HOLD |
| D3 | Seeded tester admission; everyone else deny | deployment | HOLD |
| D4 | Rollback without deleting serials/receipts/originals | deployment | documented, untested live |

## Build / Play Internal

| ID | Item | Gate | Status |
|---|---|---|---|
| B1 | Production-profile AAB (not preview APK) | build | HOLD |
| B2 | Fresh Play versionCode inventory; 23 not reserved | build | last inventory 2026-10-01 |
| B3 | Visibility patch (admit flag) if testers must see GRIN on store runtime | build | proposal only (Packet B) |
| B4 | Mapping file + AAB hash captured privately | build | HOLD |
| B5 | Upgrade from Internal vc22 + SQLite v10 migration | device + play-installed | HOLD |

## Device

| ID | Item | Gate | Status |
|---|---|---|---|
| N1 | Packet C checklist | native device | pending |
| N2 | Team 2 U-01…U-10 including RSS/PSS | native device | pending |
| N3 | TalkBack / locales on device | native device | pending |
| N4 | Play-installed GRIN upload | play-installed | pending |

## Billing / public

| ID | Item | Gate | Status |
|---|---|---|---|
| P1 | Packet D pricing written (A or B) | public release | unresolved |
| P2 | Packet D storage quota B (or written residual) | public release | unresolved |
| P3 | Packet D retention A or B implemented | public release | unresolved |
| P4 | Packet E billing if SKU B | billing | not started |
| P5 | Production-track listing/Data safety submitted | public release | not submitted |

Wave 2 / G6 stay **not accepted** until N1–N4 and D1–D3 exist at their gates.
Individual source greens (S1–S6) do not close those.
