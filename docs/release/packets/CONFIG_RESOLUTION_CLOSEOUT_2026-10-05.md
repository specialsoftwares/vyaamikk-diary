# GRIN Admin config resolution — coordinator packet (2026-10-05)

Not authorization for main merge, production exports, live deploy, EAS/native
build, OTA, Play mutation, billing activation, or public rollout.

Team 5 review:
`docs/release/proposals/team5/ADMIN_CONFIG_RESOLUTION_REVIEW.md`.

---

## A. Verified refs

| Ref | SHA |
|---|---|
| Branch | `integration/grin-g1-g5-source` |
| Application (this correction) | `4aac867af015d83f6ec3badb0748ff3b4bcc1a22` |
| Application parent (packaging) | `84c748d026d4229cded55d3ddc281a15858322c9` |
| Confirmation-refresh (preserved) | `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` |
| Prior published packaging docs | `f1be0db6c050b948fe1084a9bd68f24bddc5a4f3` |
| `origin/main` / merge-base | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |

Canonical CI for this correction is recorded after push to PR #31. Do **not**
reuse run `37330701057` (that run is packaging head `f1be0db` / merge
`ce12881`).

## B. Before / after (injected ports, no live Firebase)

Env: `GCLOUD_PROJECT=vyaamikk-diary` and Firebase runtime JSON
`projectId=vyaamikk-diary`, `storageBucket=vyaamikk-diary.firebasestorage.app`.

| | projectId | storageBucket |
|---|---|---|
| Before (`84c748d` `ensureAdminApp`) | `vyaamikk-diary` | `vyaamikk-diary.appspot.com` |
| After (`4aac867` `resolveGrinAdminBinding`) | `vyaamikk-diary` | `vyaamikk-diary.firebasestorage.app` |

Existing default app already holding `firebasestorage.app`: before still
returned `.appspot.com`; after reuses that app. Missing config: before
`demo-vyaamikk-grin-t1`; after `grin_admin_config_missing`.

## C. Remaining operational prerequisites

- `firebase login --reauth` then fresh live Rules export
- Seven-export HOLD (`functions/src/index.ts` still has no GRIN names)
- Packet B store-runtime visibility
- Read-only project/bucket preflight against live `vyaamikk-diary` /
  `vyaamikk-diary.firebasestorage.app` after reauth
- `newCommands=deny` still blocks `grinReadGoodsReceipt`; retained Storage
  GET is not full-app read/export
