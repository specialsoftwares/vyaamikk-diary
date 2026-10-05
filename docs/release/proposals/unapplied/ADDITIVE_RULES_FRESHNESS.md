# Unapplied — additive GRIN Rules (freshness blocker)

Do **not** deploy. Keep this artifact separate from repo-root quota
`firestore.rules` (`233b05b7…`).

## Freshness blocker (this assignment)

Attempted read-only re-export of live rulesets for project `vyaamikk-diary`
as CLI user `support.vyd@specialsoftwares.com`:

| Probe | When | Result |
|---|---|---|
| `firebase login:list --non-interactive` | 2026-10-05 | Logged in as `support.vyd@specialsoftwares.com` |
| `firebase projects:list --non-interactive` | 2026-10-05 (one try, not retried) | exit 2: credentials no longer valid; `firebase login --reauth` required |
| Prior `GET …/releases` with stored CLI token | earlier session | HTTP **401** |

No new live bytes were written. Do not treat the 2026-10-01 export as
re-validated on 2026-10-05. Isolated Rules config (undeployed):
`docs/release/rules-compat/proposed-grin/firebase.rules-only.json`.

Last authorized live export remains
`docs/release/rules-compat/live-export-2026-10-01/META.json`
(2026-10-01T14:04Z):

| Surface | sha256 |
|---|---|
| Live Firestore | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| Live Storage | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` |

## Matcher sources (emulator / proposal copies, not live)

- Firestore GRIN matchers: `tools/goods-evidence-emulator/functions-entry/firestore.rules`
- Storage GRIN matchers: `tools/goods-evidence-storage/storage.rules`

After `firebase login --reauth`, re-export live Firestore and Storage, abort
if sha256 differs from the table without an owner-reviewed explanation, then
merge those matchers into **that** live source. Emulator-test the merged
files. Deploy only under a later authorization, Rules-only, one product at a
time.

Do not merge GRIN into repo-root quota Firestore Rules.
Do not deploy the isolated emulator Rules files as a whole.
