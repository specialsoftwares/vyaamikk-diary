# Pull Request — Vyaamikk Diary

## Jira

- Issue: VYD-___
- Title matches issue scope: yes / no

## What changed

<!-- 2–5 lines. What and why, not a file list. -->

## Risk & scope

- Runtime behaviour changed: yes / no
- Areas touched: <!-- e.g. Authentication & Identity, Diary & Records -->
- Firebase Functions changed (deploy required): yes / no
- Firestore Rules changed (deploy required): yes / no

## Quality gates (run locally, paste result)

- [ ] `npm run ci:verify` (full gate — required; paste final line)
- [ ] `npm --prefix functions run lint` (if functions touched)
- [ ] Relevant targeted `test:*` scripts re-run for the touched area

## Validation

- [ ] Acceptance criteria on the Jira issue are met
- [ ] Physical/device validation required before Completed: yes / no
  - If yes, the Jira issue stays in **Internal Validation** until verified on a candidate build.

## Release

- Target release (Jira version): vc___
- versionCode changed: yes / no (only release PRs change it)
