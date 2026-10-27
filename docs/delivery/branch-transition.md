# Branch transition

`integration` is the current development branch and the head of draft PR #42. `develop` is the agreed future name for that same development branch. The remote rename is deferred. `develop` does not exist as a remote branch. This page records the procedure. It does not carry it out.

## Vocabulary

| Name | Meaning |
|---|---|
| `integration` | Current development branch and head of draft PR #42 |
| `develop` | Agreed future name for that same development branch |
| `main` | Approved production-source branch |
| `staging` | Intended isolated testing environment; not yet established |
| `production` | Live infrastructure and data |
| SIT | System Integration Testing |
| UAT | User Acceptance Testing |
| Release candidate | Exact source commit, configuration, and identified build awaiting acceptance |

## Current refs

| Ref | SHA |
|---|---|
| `integration` (local and `origin/integration`) | `2cffebf913243b12703d73888e4770182cf4edd0` |
| `origin/main` | `021630cdc5ed7d7a19db14da9b419b7215ea63b8` |

No commits have been added to `integration` since that reviewed head. `integration` contains commits that are not in `main`. `main` has no commits that `integration` lacks.

PR #42 is open, draft, and not merged. Its base ref is `main` at `021630cdc5ed7d7a19db14da9b419b7215ea63b8`. Its head ref is `integration` at `2cffebf913243b12703d73888e4770182cf4edd0`. The title remains "Fix auth readiness and protect public error messages".

GitHub closes a pull request when its head branch is renamed. PR #42 stays on `integration` until it is resolved or the owner explicitly approves a replacement draft PR.

## Deferred procedure

When the owner asks, do these steps in order:

1. Resolve draft PR #42, or replace it only after the owner explicitly approves a replacement draft PR.
2. Create `develop` at the accepted `integration` SHA.
3. Confirm CI. This commit prepares the push trigger so `push` accepts `main`, `integration`, and `develop`. `pull_request` stays `main` and `security/firebase-session-hardening`. A renamed head would open a new pull request, so the current PR does not listen to `develop`.
4. Update local fetch refspecs. The integration worktree currently fetches only `refs/heads/main` into `refs/remotes/origin/main`. That local config was observed and is left unchanged.
5. Re-check branch protection and rulesets. They are absent today: a protection GET for `main` and for `integration` returned 404 Branch not protected, and the rulesets list is empty.
6. Keep `integration` until `develop` is the pull request head or the owner says to delete it.

## Inventory

Only `.github/workflows/ci.yml` selects a branch. That workflow runs `npm ci`, functions `npm ci`, and `npm run ci:verify`. It has no deploy, EAS, or Play job. There is no second workflow. Branch protection is absent. Rulesets are empty. Historical notes under `docs/release` keep old `origin/integration/...` ref names on purpose.

## Environments

`staging` is not provisioned. `production` remains the live project `vyaamikk-diary`.

Source on `integration`, CI for a SHA, backend deploy, artifact build, device acceptance, and Play publication are separate authorisations.
