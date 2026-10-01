# Unsent Jira comments — versionCode source preparation (2026-10-01)

Atlassian/Jira write is **not available** in this environment (no Jira MCP, no `JIRA_*` / `ATLASSIAN_*` process env). Do **not** mark device, Play, or security tickets Done from source CI. Paste only if the issue still exists; do not create duplicates.

## VYD-38 (subscription management)

VersionCode-only source preparation on `release/android-source-candidate` (PR #29).

- Frozen accepted application SHA remains `7e9e66055db20d5289424c61347bc72a64fd94e3` (purchase-entry/quota-upsell flags explicit `"0"`). Not reopened.
- Proposed build-source SHA: `6e3dbba9b2173fbb5ffde8ffbbccd5b7dac3e559` (`app.json` `android.versionCode` 22→23 only). Version name `1.0.0`. Package `com.specialsoftwares.vyaamikkdiary`.
- Play complete inventory 2026-10-01T13:29:51Z: 22 Internal Active; 23 absent. 23 is not reserved.
- Canonical CI for `6e3dbba`: GitHub Actions run [`36874104343`](https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/36874104343) / job `110408998132`, merge-ref `f922e2b1da988de30782818905bdf7dc72bfecb9`, `test:all` 144/144, `ci:verify` PASS. Do not reuse `36864750074`.
- Build, Internal upload, and public release: **not authorized**. Installed vc22 source correspondence remains UNVERIFIED. This SHA does not reconstruct vc22.

## VYD-39 (reconciliation)

Same candidate; no reconciliation source change in this assignment. Billing Functions are **deployed** on live Firebase as of 2026-10-01 (including `scheduledBillingReconciliation`); that is **not** a production-enablement or Done claim. Client purchase-entry flags remain `"0"`.

## VYD-20 (Phase-1 CI)

Canonical `ci:verify` for versionCode source `6e3dbba` is GitHub Actions workflow CI / job verify / run `36874104343` / job `110408998132` (success, merge-ref `f922e2b1da988de30782818905bdf7dc72bfecb9`, 144/144). Do not attach run `36864750074` (`7e9e660`) to this SHA.
