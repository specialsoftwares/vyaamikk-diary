# Vyaamikk billing UX harness

Isolated presentation host for UpgradeSheet, BenefitEducationScreen, and the preview lab.

**Isolated component preview — not full-app or native validation.**

```bash
npm run start:billing-ux-harness
```

Opens on port **8092**. Uses the candidate lockfile Expo CLI at `../../node_modules/.bin/expo` (committed `expo@~54.0.36`, `expo-router@~6.0.24`). Does not start application bootstrap, auth, SQLite, or sync.

Captures under `captures/` are Playwright/Chrome **page viewport** screenshots of this host, with `capture-manifest.json` recording viewport, devicePixelRatio, language, selected state, and candidate SHA. They are not native accessibility or store validation.

```bash
# after the harness is serving on :8092
node tools/billing-ux-harness/scripts/capture-isolated.mjs
```
