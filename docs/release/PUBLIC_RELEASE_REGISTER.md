# Public Android release register

Fields are distinct. Source tests do not mark tickets complete. This assignment did not deploy or publicly release anything.

## Reviewed checkpoint (previous closeout candidate)

Independently retrieved Actions on reviewed head `f875356efb4030d24fd60c5b80f1470b13d782a5`: https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/35454180029 job `105926441702` SUCCESS. Checkout merge of that head into main `79d405d0b626d5067a33541887ac3c70689b8724`. That candidate’s `test:all` was **139/139** in 374.4s; `ci:verify` PASS including Expo config and invoice-renderer Docker. **Do not cite** older run `35446043899` / head `6c46a70` as evidence for `f875356` or later heads.

## This continuation (closeout corrections)

Worktree: isolated `release/public-android-combined` (PR #26). Historical workspace and dirty local-main email-OTP were not edited.

| Ref | SHA |
| --- | --- |
| Main/base | `79d405d0b626d5067a33541887ac3c70689b8724` |
| Previous reviewed head | `f875356efb4030d24fd60c5b80f1470b13d782a5` |
| Core-app application (startup App Check + subscription ops + typecheck) | `b5cfbf7050e1e75d30acf274e82ca90259f02950` |
| Paid-backend follow-up (maintenance/reporting/Play audit) | `24595dbd4ff6fe3c9c0031926e93ddeafae83954` |
| Branch HEAD (register/packets) | `38346ae09952947dc51e50eeeee9098b802bd8c7` |

Local canonical `test:all` on the paid follow-up working tree: **139/139 passed in 250.4s**. Suite count stays 139 because the new emulator suite is invoked from `ci:verify`, not `test:all`. `typecheck`, `lint:eslint`, and `functions` build PASS. `test:billing-maintenance-emulator` PASS under `firebase emulators:exec`.

Fresh Actions are **required** on the exact HEAD of this continuation and its tested merge-ref into `79d405d`. Do not reuse `35454180029` as the gate for these new SHAs.

Local skips (disclose; do not npm-install into the shared `node_modules` symlink):

- `npx expo config --type public` previously FAIL locally: PluginError resolving `@react-native-firebase/app-check` (package absent from the symlink `node_modules`). CI on `f875356` already passed Expo config after `npm ci`.
- `test:invoice-renderer-docker`: `docker_missing` on this host. CI on `f875356` built the image.

| Work | Source implemented | Independently reviewed | Deployed | Device-tested | Store-tested | Public-ready |
| --- | --- | --- | --- | --- | --- | --- |
| Isolated #22+#24+#25 combination | Yes — merge `a3317148d6e24bc980bbe5637b65ecac84e45b0d` | Prior review of combination | No | No | No | No |
| Live-Rules compatibility artifact | Yes — hashed baseline + proposed patch; full-caller emulator coverage | No (security-sensitive) | No | N/A | N/A | No |
| VYD-38 subscription management | Yes — separate load/save/restore/manage identities, live auth+session masking, IST monthKey, purchase-entry gate, invoice-ready vs draft, 80% warning on subscription screen **and** You dashboard banner | No | No | No | No | No |
| VYD-39 reconciliation | Yes — preserved queue/consumer leases; **plus** document-id maintenance scan, isolated per-account failures, sidecar backoff, overlapping-tick lease, paginated complete `_revenueReports`; flags closed | No | No | N/A | No | No |
| App Check source | Partial — bounded native init on startup; detached `getToken(false)` diagnostic; no boot `getToken(true)`; JS SDK probed, `initializeAppCheck` not called; unenforced | No | No | No (needs store binary) | No | No |
| Play listing/legal drafts | Drafts only | No (owner/lawyer) | No Console submit | No | No | No |
| Play catalog / RTDN / licence testers | Read-only Console inspection 2026-09-20 — catalog **empty**, RTDN topic **empty**, licence lists 2+3 users | Console-visible; not a Publisher API pull | No product create | No | No | No |
| Merchant KYC | N/A (human payments-readiness) | Owner-handled separately; status still **pending owner confirmation** | N/A | N/A | N/A | No |
| Original PRs #20–#25 | Unchanged, HOLD | Existing review state | No merge to main | — | — | — |
| Canonical `test:all` | Local 139/139 in 250.4s on this continuation | Fresh Actions required on HEAD | — | — | — | — |
| Canonical `ci:verify` remainder | Local emulators for new maintenance suite PASS. Prior `f875356` CI closed Expo/Docker for that candidate only. | Fresh Actions required | — | — | — | — |

Jira: Atlassian write is not available in this environment. Do **not** mark VYD-38/39 or device/store tickets complete from source tests. An owner update is still required in Jira after independent review.

HOLDs preserved: main merge, auto-merge, EAS/native build, live flags/secrets/IAM, store writes (including Play product create), upload, production backfill, public rollout, historical workspace email-OTP, merchant KYC performance.
