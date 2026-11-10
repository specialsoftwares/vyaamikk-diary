# Continue the single release candidate

The source corrections are committed on `fix/release-candidate-readiness`. The accompanying incremental Git bundle imports that branch into an existing authorized local clone; the PR #55 baseline `b4ae1ed030e79fa245b8a7c6c2ed4e8ee4ae3753` and its history must be present. `git bundle verify` must succeed before import. It does not change `main`, `integration`, PR #42, PR #54 or PR #55. The candidate is not release-accepted.

## Import and publish the reviewed source

Run from the existing authorized repository, replacing the bundle path with the downloaded file. Do not reset an existing checkout or overwrite a branch with local work.

```sh
git fetch origin
git bundle verify /absolute/path/release-candidate-readiness.bundle
git fetch /absolute/path/release-candidate-readiness.bundle refs/heads/fix/release-candidate-readiness:refs/heads/fix/release-candidate-readiness
git worktree add ../vyaamikk-release-candidate fix/release-candidate-readiness
cd ../vyaamikk-release-candidate
git status --short
git log -3 --oneline
git push -u origin fix/release-candidate-readiness
```

Open a draft PR targeting `integration`. Re-read the current remote heads before resolving any new divergence. Do not merge integration into main or replace the existing drafts as part of this import. The candidate's workflow runs automatic checks for all PR base branches, including stacked correction branches.

Use a concrete PR description: this candidate combines the reviewed main baseline with PR #54/#55, fixes native phone/contact ownership, conditional consent cleanup, crash consent startup/queue ownership, mailbox/recovery authorization and retries, and screen/age lifecycle races. Selected Firestore GRIN reads are added under existing owner/session/restore/deletion guards. Storage transport authorization remains a release blocker.

## Complete the remaining acceptance work

Read `EXECUTION_SHEET.md` and `STORAGE_AUTHORIZATION_BLOCKER.md` first. Continue the finite gates recorded there; do not launch another unrelated broad audit.

1. Run the automatic canonical GitHub check on the published candidate. Fix actual failures and record the exact head/run/job. A prior PR's CI or local loader-substituted run does not certify this head.
2. Resolve the Storage authorization boundary and old-client transition before a public candidate is accepted. Do not copy the historical GRIN Storage proposal or remove owner/session/restore/deletion checks to fit the production read budget. The documented server-mediated design still needs implementation, review and tests.
3. Re-read live Functions, Rules, bindings and bucket IAM using the existing authorized project account. Prepare and review a specific deploy/rollback manifest, including the explicit source-denial handlers for `checkMobileQuarantine` and `rebindQuarantinedMobileCallable`. Close the remaining evidence gaps in the execution sheet. Version-2 GRIN deletion is already approved; verify its serving behavior without inventing a new policy gate or changing legacy deadlines. Do not deploy all functions, rotate secrets, alter deletion jobs, activate the reported account manually or send repeated OTPs.
4. Preserve the validated compiler/minifier pins and guarded datetimepicker prebuild correction. Local native compilation, five policy tests and offline shrinking passed; the signed EAS build must still validate its real production configuration. Do not bypass Kotlin metadata checks or disable release minification to hide an SDK mismatch.
5. Use the existing authenticated EAS account and fresh Play inventory to choose an unused Android versionCode. The candidate's current 34 is already used. Update `app.json`, `src/goodsEvidence/isolation.contract.test.ts`, and `src/goodsEvidence/internalAuthValidationProfile.test.ts` together in a version-only change. Obtain canonical CI on the resulting head.
6. From a clean checkout of that frozen head, after the serving dependencies and source gates are accepted, run the pinned build command:

```sh
npx --yes eas-cli@16.28.0 build --platform android --profile internal-grin --non-interactive --wait
```

The existing Firebase identity pre-install check must pass against the real EAS secret file. Record the EAS build ID, source SHA, AAB SHA-256, package/version and upload certificate. A local compile with a demo Firebase file is not this artifact.

7. Install and test that exact signed binary through the agreed internal testing route. Require actual account-screen completion, first save/read, upload/read/delete, safe timeout/change-number/back, account switching, consent withdrawal/restart and offline/error/loading acceptance. Capture one normal OTP attempt when needed; do not claim provider acknowledgement proves handset delivery.

Do not label the release accepted or publish it publicly until these gates are evidenced. Build authorization does not supply missing credentials or establish device acceptance.
