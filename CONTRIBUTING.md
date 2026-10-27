# Contributing — Vyaamikk Diary

Engineering conventions for the Vyaamikk Diary app (`com.specialsoftwares.vyaamikkdiary`).
Jira project: **Vyaamikk Diary – Engineering** (key **VYD**). Board: Backlog → In Development → Review & QA Gate → Internal Validation → Completed.

Note: the app's UEID format `VYD-2026-XXXXXX` is unrelated to Jira keys (`VYD-123`). In commits and branches, `VYD-<number>` always means the Jira issue.

## Branches and environments

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

`integration` is the temporary name. `develop` is the agreed future name for that same development branch. The remote rename is deferred. GitHub closes a pull request when its head branch is renamed, so draft PR #42 stays open on `integration` until it is resolved or the owner explicitly approves a replacement draft PR. `develop` is not a remote branch yet. `staging` is not provisioned. Details and the ordered procedure are in `docs/delivery/branch-transition.md`.

## Traceability (required for significant changes)

- Branch: `VYD-123-short-description`
- Commit: `VYD-123: concise change description`
- PR title: `VYD-123: concise PR title`
- Never push directly to `main`. All changes land via PR.

Chain: Jira issue → branch → commit → PR → build → internal validation → Completed.

## Quality gates before any PR

```bash
npm run ci:verify   # full gate: typecheck + eslint + test:all (98 suites)
                    # + Functions build + both emulator suites + config preflight
```

For fast iteration you may run targeted gates (`npm run typecheck`, `npm run lint`, the `test:*` scripts for the touched area, `npm --prefix functions run lint`), but `ci:verify` must pass before review.

All tests are plain `tsx` scripts (no Jest). The two emulator suites use fake project IDs and the local Firestore emulator only — never production.

CI: Jenkins will later run `npm run ci:verify` as a mandatory PR status check. Until Jenkins exists, run it locally and paste the result in the PR.

## Bug severity

| Priority | Meaning |
|---|---|
| P0 / Highest | Data loss, security exposure, login impossible, app cannot start |
| P1 / High | Core journey blocked, no reasonable workaround |
| P2 / Medium | Functional defect with workaround or limited scope |
| P3 / Low | Minor UX/cosmetic, non-blocking |

Priority is business/release urgency — not effort, not ego.

## Bug report standard

Every serious bug must be reproducible from its Jira ticket alone:

- **Summary** — precise defect, not "login broken"
- **Build** — versionName / versionCode / vc release / commit SHA
- **Environment** — development / preview / internal / production
- **Device + Android version**
- **Preconditions** — account/session/setup
- **Steps to reproduce** — deterministic, numbered
- **Expected vs actual result**
- **Reproducibility** — always / intermittent / once
- **Evidence** — screenshot / recording / logs / exact error text
- **Regression** — worked before? yes / no / unknown
- **Suspected component** — only if evidence supports it
- **Validation criteria** — exact behaviour required to close

## Definition of Ready (meaningful items entering In Development)

Problem, intended behaviour, acceptance criteria, constraints, dependencies, severity. Tiny obvious tasks are exempt — clarity, not paperwork.

## Definition of Done (Completed)

1. Implementation finished, PR reviewed and merged
2. Quality gates green (typecheck, lint, relevant tests)
3. No known regression introduced
4. Build/revision containing the change identified
5. Physical/internal validation done where runtime behaviour changed
6. Jira acceptance criteria satisfied

A merged PR alone is **not** Done. Runtime-affecting changes stay in Internal Validation until verified on a candidate build.

## Release rules

- `android.versionCode` changes only in explicit release commits (EAS `appVersionSource: local`, `autoIncrement: false`).
- Release candidates are immutable: one AAB per candidate, recorded with SHA-256, built from a clean, committed, pushed SHA.
- Firebase Functions / Firestore Rules deploys and Play uploads are owner-approved actions — never automatic. Interns and contributors never deploy to production; the owner performs or explicitly approves every deploy.

## Safety

Never commit secrets (`.env`, `google-services.json`, service accounts, keystores are gitignored — keep it that way). Never put secrets in Jira, commits, or docs.
