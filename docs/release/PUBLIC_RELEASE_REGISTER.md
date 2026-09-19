# Public Android release register

Fields are distinct. Source tests do not mark tickets complete. This assignment did not deploy or publicly release anything.

Independently retrieved Actions on reviewed head `6c46a7067269eed679d9079efcf2bb30d43a588f`: https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/35446043899 job 105905020493 SUCCESS. Checkout `40ba879e7ee7fcd9eac3e97d33b944a66770b735` (merge of that head into main `79d405d0b626d5067a33541887ac3c70689b8724`). That head’s `test:all` was 139/139 in 370.3s; `ci:verify` PASS including Expo config and invoice-renderer Docker.

This continuation changes source after `6c46a70`. Application commit: `fe55c226c07a1263d88663036e5f86d985cbb494`. Fresh Actions are required on that SHA and any later docs-only head. Do not treat the reviewed-head 139/139 as the suite result for the new head.

Local canonical run on this continuation’s completed candidate (isolated worktree, 2026-09-19): `test:all` **139/139 passed in 429.5s**. Suite count stays 139 because new files were added to existing `test:*` scripts. `typecheck`, `lint:eslint`, and `functions` build PASS. Remaining `ci:verify` emulator stages PASS (`test:live-rules-compat` **LIVE_RULES_COMPAT PASS** including production save callers; `test:firestore-rules`; `test:storage-rules`; `test:resolve-or-create-phone-emulator`; billing transaction/GST/Play/Apple emulators). `check:firebase-client` PASS. `test:invoice-renderer-build` PASS on host Node v20.19.4.

Local skips (disclose; do not npm-install into the shared `node_modules` symlink):

- `npx expo config --type public` FAIL: PluginError resolving `@react-native-firebase/app-check` (package absent from the symlink `node_modules`). Independently retrieved CI on `6c46a70` already passed Expo config after `npm ci`.
- `test:invoice-renderer-docker`: `docker_missing`. CI on `6c46a70` built the image.

| Work | Source implemented | Independently reviewed | Deployed | Device-tested | Store-tested | Public-ready |
| --- | --- | --- | --- | --- | --- | --- |
| Isolated #22+#24+#25 combination | Yes — merge `a3317148d6e24bc980bbe5637b65ecac84e45b0d` | Prior review of combination | No | No | No | No |
| Live-Rules compatibility artifact | Yes — hashed baseline + proposed patch; full-caller emulator coverage | No (security-sensitive) | No | N/A | N/A | No |
| VYD-38 subscription management | Yes — session-owned runtime, IST monthKey, purchase-entry gate, invoice-ready vs draft, 80% warning on subscription screen **and** You dashboard banner (opens Settings; no purchase CTA) | No | No | No | No | No |
| VYD-39 reconciliation | Yes — unique invocation/leases, lease-checked complete, operator budget, pagination+indexes, structured outcomes, stale-company + never-reconciled (`lastReconciledAt == null`) maintenance, commission reporting; flags closed | No | No | N/A | No | No |
| App Check source | Partial — native Play Integrity / iOS App Attest init + optional getToken (not copied to JS); JS SDK probed, `initializeAppCheck` not called (app-identity constraint); report stored; unenforced | No | No | No (needs store binary) | No | No |
| Play listing/legal drafts | Drafts only | No (owner/lawyer) | No Console submit | No | No | No |
| Merchant KYC | N/A (human payments-readiness) | Owner-handled separately | N/A | N/A | N/A | No |
| Original PRs #20–#25 | Unchanged, HOLD | Existing review state | No merge to main | — | — | — |
| Canonical `test:all` | Local 139/139 in 429.5s on `fe55c22`. Reviewed-head Actions 139/139 on `35446043899`. | Fresh Actions required on `fe55c22` (and any later docs-only SHA) | — | — | — | — |
| Canonical `ci:verify` remainder | Local emulators + firebase-client + invoice-renderer-build PASS. Local skips: Expo config (app-check missing from symlink); invoice-renderer Docker (`docker_missing`). CI on `6c46a70` passed Expo config and Docker. | Fresh Actions required | — | — | — | — |

HOLDs preserved: main merge, auto-merge, EAS/native build, live flags/secrets/IAM, store writes, upload, production backfill, public rollout, historical workspace email-OTP.
