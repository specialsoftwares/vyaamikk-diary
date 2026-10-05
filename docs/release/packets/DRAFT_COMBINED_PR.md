# Draft combined PR (owner-created #31 — do not duplicate)

Draft PR exists: https://github.com/specialsoftwares/vyaamikk-diary/pull/31

Do not create another PR. Do not enable auto-merge. Do not retry ChatGPT 403.
`gh` in this environment is **not logged in**. Push of application
`84c748d` requires owner authentication.

## Recorded GitHub facts (public API, 2026-10-05)

| Field | Value |
|---|---|
| Number | 31 |
| State | open, draft |
| Title | Integration/grin g1 g5 source (default website title) |
| Head at PR-open CI | `ba3233720ddec89020ff55672846ab219d9e5231` |
| Base | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` (`main`) |
| Merge commit (GitHub) | `51bbfe98844f106f456150959c152b4754023892` |
| Merge parents | `0da2f58` + `ba32337` |
| Actions run | `37309701455` (`pull_request`, success) |
| Job | `111761813010` `verify` success |
| Workflow | `.github/workflows/ci.yml` — `npm ci` + functions `npm ci` + `npm run ci:verify`; **no** deploy |

Application SHA `84c748d026d4229cded55d3ddc281a15858322c9` is **not** on that
run. After owner push, record the new run/job IDs. Do not describe the
`ba32337` success as packaging-source CI.

## After push

Canonical CI is the GitHub Actions `verify` job on:

- the PR head (must contain `84c748d` or a fast-forward of it), and
- `refs/pull/31/merge`

Record head SHA, base SHA, merge parents, run ID, job ID, results, real skips.
If renderer Docker or joined GRIN emulators skip, that is a **real skip**.
