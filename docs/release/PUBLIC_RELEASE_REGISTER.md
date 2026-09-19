# Public Android release register

Fields are distinct. Source tests do not mark tickets complete. This assignment did not deploy or publicly release anything.

## Reviewed checkpoint (previous closeout candidate)

Independently retrieved Actions on reviewed head `d0de2f4afc42dcc757ed1d7bce565c26835c79ec`: https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/35464695768 job `105954793956` SUCCESS. Checkout merge of that head into main `79d405d0b626d5067a33541887ac3c70689b8724`. That candidate’s `test:all` was **139/139** in 379.1s; `ci:verify` PASS including Expo config, invoice-renderer Docker, and maintenance emulator. **Do not cite** that run as evidence for later SHAs in this continuation.

## This continuation (targeted closeout 2)

Worktree: isolated `release/public-android-combined` (PR #26). Historical workspace and dirty local-main email-OTP were not edited. Play Console was not re-inspected.

| Ref | SHA |
| --- | --- |
| Main/base | `79d405d0b626d5067a33541887ac3c70689b8724` |
| Previous reviewed head | `d0de2f4afc42dcc757ed1d7bce565c26835c79ec` |
| Core-app application (draft revision + originating-session binds) | `e08a26f21b997eb8cde3687fe27a95aa018979aa` |
| Paid-backend follow-up (inflow gross, report scanStartedAt, lease-fenced backoff) | `a1bd2a5bb72f19af6f98222cb8f5e983bca33ec6` |
| Branch HEAD (register/packets) | `c39adc53e7bfa863a418962804dafe2c80159803` |

Local canonical `test:all` on the paid follow-up working tree: **139/139 passed in 254.3s**. Suite count stays 139. `typecheck`, `lint:eslint`, and `functions` build PASS. Fresh Actions are **required** on the exact HEAD of this continuation and its tested merge-ref into `79d405d`. Do not reuse `35464695768` as the gate for these new SHAs.

Local skips (disclose; do not npm-install into the shared `node_modules` symlink):

- `npx expo config --type public` previously FAIL locally: PluginError resolving `@react-native-firebase/app-check` (package absent from the symlink `node_modules`). CI on `d0de2f4` already passed Expo config after `npm ci`.
- `test:invoice-renderer-docker`: `docker_missing` on this host. CI on `d0de2f4` built the image.

Live Rules comparison 2026-09-19T20:55Z (`support.vyd@specialsoftwares.com`, project `vyaamikk-diary`): **no drift**. Firestore sha256 `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`. Proposed compat hash confirmed `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`. Baseline files were not replaced. No deploy.

| Work | Source implemented | Independently reviewed | Deployed | Device-tested | Store-tested | Public-ready |
| --- | --- | --- | --- | --- | --- | --- |
| Isolated #22+#24+#25 combination | Yes — merge `a3317148d6e24bc980bbe5637b65ecac84e45b0d` | Prior review of combination | No | No | No | No |
| Live-Rules compatibility artifact | Yes — hashed baseline + proposed patch; fresh live compare no drift; full-caller emulator coverage | No (security-sensitive) | No | N/A | N/A | No |
| VYD-38 subscription management | Yes — separate identities, live masking, draft revision on Save, originating-session binds, IST monthKey, purchase-entry gate, invoice-ready vs draft, 80% warning | No | No | No | No | No |
| VYD-39 reconciliation | Yes — preserved queue/consumer leases; document-id maintenance scan; lease-fenced backoff; inflow-only gross; `scanStartedAt` persist guard; flags closed | No | No | N/A | No | No |
| App Check source | Partial — bounded native init on startup; detached `getToken(false)` diagnostic; no boot `getToken(true)`; JS SDK probed, `initializeAppCheck` not called; unenforced | No | No | No (needs store binary) | No | No |
| Play listing/legal drafts | Drafts only | No (owner/lawyer) | No Console submit | No | No | No |
| Play catalog / RTDN / licence testers | Last Console read 2026-09-20 — catalog **empty**, RTDN topic **empty**, licence lists 2+3 users. This closeout did not re-inspect. | Console-visible; not a Publisher API pull | No product create | No | No | No |
| Merchant KYC | N/A (human payments-readiness) | Owner-handled separately; status still **pending owner confirmation** | N/A | N/A | N/A | No |
| Original PRs #20–#25 | Unchanged, HOLD | Existing review state | No merge to main | — | — | — |
| Canonical `test:all` | Local 139/139 in 254.3s on this continuation | Fresh Actions required on HEAD | — | — | — | — |
| Canonical `ci:verify` remainder | Not re-run locally this closeout (Expo/Docker skip on symlink host). Prior `d0de2f4` CI closed Expo/Docker for that candidate only. | Fresh Actions required | — | — | — | — |

Jira: Atlassian write is not available in this environment. Do **not** mark VYD-38/39 or device/store tickets complete from source tests. An owner update is still required in Jira after independent review.

HOLDs preserved: main merge, auto-merge, EAS/native build, live flags/secrets/IAM, store writes (including Play product create), upload, production backfill, public rollout, historical workspace email-OTP, merchant KYC performance.
