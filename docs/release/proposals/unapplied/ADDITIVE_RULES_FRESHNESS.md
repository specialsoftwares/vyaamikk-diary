# Unapplied — additive GRIN Rules (freshness blocker)

Do **not** deploy. Keep this artifact separate from repo-root quota
`firestore.rules` (`233b05b7…`).

## Freshness blocker (this assignment)

Attempted read-only re-export of live rulesets for project `vyaamikk-diary`
as CLI user `support.vyd@specialsoftwares.com`:

| Probe | Result |
|---|---|
| `GET https://firebaserules.googleapis.com/v1/projects/vyaamikk-diary/releases` with the stored Firebase CLI access token | HTTP **401** |
| `firebase projects:list --non-interactive` | Authentication Error: credentials no longer valid; `firebase login --reauth` required |

No new live bytes were written. Do not treat the 2026-10-01 export as
re-validated today.

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
