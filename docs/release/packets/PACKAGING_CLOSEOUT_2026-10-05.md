# GRIN production packaging — coordinator packet (2026-10-05)

Not authorization for main merge, production exports, live deploy, EAS/native
build, OTA, Play mutation, billing activation, or public rollout.

Team 5 packaging review:
`docs/release/proposals/team5/PACKAGING_SLICE_REVIEW.md`.
Prior RC review of `dcc325a` is not repeated.

---

## A. Verified refs and canonical CI

| Ref | SHA |
|---|---|
| Branch | `integration/grin-g1-g5-source` |
| Application (this packaging) | `84c748d026d4229cded55d3ddc281a15858322c9` |
| Confirmation-refresh (preserved) | `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` |
| Published packet at PR open | `ba3233720ddec89020ff55672846ab219d9e5231` |
| `origin/main` / merge-base | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |

**Combined PR:** owner-created draft
https://github.com/specialsoftwares/vyaamikk-diary/pull/31
(`draft=true`, title “Integration/grin g1 g5 source”, auto-merge off).
No duplicate PR created. ChatGPT 403 not retried. `gh` still not logged in.

| CI item | Value |
|---|---|
| Run on published packet head | `37309701455` |
| Job | `111761813010` `verify` **success** |
| Event | `pull_request` |
| Head | `ba3233720ddec89020ff55672846ab219d9e5231` |
| Base | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |
| Merge ref commit | `51bbfe98844f106f456150959c152b4754023892` |
| Merge parents | `0da2f58` + `ba32337` |
| Skipped Actions steps | none reported on the public jobs API |
| `ci:verify` on `84c748d` | **not run** — SHA is local until owner push |

That Actions success is evidence for the **docs packet**, not for production
compose. New source needs a new run.

## B. Production composition

Landed under `functions/src/goodsEvidence/productionCompose.ts`. Isolated
emulator re-exports it. Packager copies G1/G2 from tools with drift checks.
`functions/src/index.ts` GRIN exports **absent**. Unapplied:
`docs/release/proposals/unapplied/functions-index-seven-export.diff.md`.

Local evidence: `test:goods-evidence-g1-functions-emulator` (roundtrip +
pack-complete + gates) exit 0; `test:goods-evidence-g1-unit` exit 0;
`test:goods-evidence-g2-unit` and `test:goods-evidence-g2-emulator` exit 0;
`npm --prefix functions run build` exit 0.

## C. Unapplied live operations

- Seven-export + Functions deploy + env `"true"`
- Additive Rules after `firebase login --reauth` (401 freshness blocker)
- IAM writes (matrix only)
- Packet B store-runtime visibility
- Tester seeding, EAS, OTA, Play, billing, main merge

## D. Next operation requiring approval

Owner `gh auth login` (or equivalent), **push** `84c748d` to
`integration/grin-g1-g5-source` so PR #31 updates, then record canonical
`ci:verify` on that head and `refs/pull/31/merge`. Do not auto-merge.
Do not live-deploy from this packet.
