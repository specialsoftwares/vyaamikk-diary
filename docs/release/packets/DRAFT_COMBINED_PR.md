# Draft combined PR (owner creates — do not duplicate)

GitHub CLI in this environment: **not logged in**. ChatGPT connector previously
returned HTTP 403 “Resource not accessible by integration.” Do not retry those
same operations. Do not paste tokens into chat.

Public search (2026-10-05): **no pull request** with head
`integration/grin-g1-g5-source`. GitHub Actions workflow `CI` on that branch:
`total_count` 0 (expected: `on` is `pull_request` to `main`, `push` to `main`,
`workflow_dispatch` only).

## Compare

https://github.com/specialsoftwares/vyaamikk-diary/compare/main...integration/grin-g1-g5-source

Base should be `main` at `0da2f58970f23c7ce6cbefae6efffd49c731f44b` unless main
moved — if main moved, still open against current `main` and do not rewind
authorized combined commits.

## Manual draft creation

1. `gh auth login` (owner machine; do not send the token here).
2. Confirm no existing PR:  
   `gh pr list --head integration/grin-g1-g5-source --state all`
3. If none, create **draft**, auto-merge **off**:

```bash
gh pr create --draft --base main --head integration/grin-g1-g5-source \
  --title "GRIN G1–G5 isolated source (draft, do not merge)" \
  --body-file docs/release/packets/DRAFT_COMBINED_PR.md
```

Keep unmerged. Do not enable auto-merge.

## Workflow check (already inspected in source)

`.github/workflows/ci.yml` runs `npm ci` + `npm --prefix functions ci` +
`npm run ci:verify` only. **No** Firebase deploy, Rules deploy, EAS, Play
upload, or production credential echo. `permissions: contents: read`.

## After the PR exists

Canonical CI is the GitHub Actions `verify` job on:

- the PR head (application-containing SHA, currently `dcc325a` plus later
  **docs** commits), and
- the GitHub merge ref (`refs/pull/<n>/merge`) once computed.

Record: head SHA, base SHA, merge parents, run ID, job ID, results, real skips.
Do not describe a local Docker-skipped `ci:verify` as that run.

If renderer Docker or joined GRIN emulators are skipped in Actions, that is a
**real skip** to record, not a pass.

## Suggested body

See the rest of this file.

---

## Summary

Isolated GRIN (goods receipt / evidence) source on `integration/grin-g1-g5-source`.
**Draft. Do not merge to main.** Do not deploy Functions/Rules, EAS, OTA, Play,
or billing from this PR.

Application SHA: `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` (confirmation
refresh after evidence linkage). Default-off; store-runtime still blocks Play
binaries; `functions/src/index.ts` has no GRIN export; live Rules unchanged;
purchase-entry `"0"`; `versionCode` 23 in source is **not reserved**.

## Test plan

- [ ] GitHub Actions `CI` / `ci:verify` on this PR (renderer Docker + joined GRIN emulators)
- [ ] Confirm workflow has no deploy steps
- [ ] Do not merge; auto-merge off
- [ ] Native device / Play Internal / live backend remain separate authorizations
