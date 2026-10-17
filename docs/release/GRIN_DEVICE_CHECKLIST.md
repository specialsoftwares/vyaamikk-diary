# GRIN device checklist

Status: **`device_pending`**

Team 5 Wave 1 preparation only. Native-device and Play-installed tests **have not occurred**. This file does not authorize Internal Testing, EAS, Play upload, live backends, billing, or production admission.

Do not mark G6, device acceptance, billing, or public release complete from this document.

Scripts under `tools/grin-acceptance/device/` print `device_pending` / `play_pending` and exit non-zero. They refuse EAS, Play, firebase deploy, and production project access.

Contract revision: `2026-10-01.wave1`.

## Evidence envelope (required fields)

Every future device/Play run must produce a JSON object matching `tools/grin-acceptance/device/expectedEvidence.ts` (`DeviceEvidenceEnvelope`). Missing fields keep the row `device_pending` / `play_pending`.

| Field | Required | Notes |
|---|---|---|
| `schemaVersion` | yes | `1` |
| `matrixIds` | yes | IDs this artefact claims to address |
| `status` | yes | `device_pending` until a later authorized run fills `executed` |
| `executed` | yes | `false` for Wave 1 |
| `worktreeHead` | yes | git SHA of the binary/source under test |
| `contractRevision` | yes | must equal `2026-10-01.wave1` or a later acknowledged revision |
| `appVersionName` | yes | from the installed binary |
| `appVersionCode` | yes | from the installed binary |
| `applicationId` | yes | Play application id; not a user identifier |
| `buildChannel` | yes | `development-build` / `internal-testing` / `play-installed` |
| `deviceModel` | yes | hardware model |
| `androidApi` | yes | integer API level (Android-first candidate) |
| `talkbackVersion` | when DEV-02 | TalkBack version string |
| `testerRole` | yes | `owner-operator` / `independent-qa`; not a personal name in shared logs |
| `startedAtUtc` | when executed | ISO-8601 |
| `endedAtUtc` | when executed | ISO-8601 |
| `networkSteps` | when CS-01/DEV-01/DEV-05 | ordered airplane-mode / reconnect observations |
| `issuedNumbersObserved` | when CS-01/CS-04/CS-10 | list; must be length 1 for CS-01 after reconnect |
| `outboxStatesObserved` | when G3 | `OutboxLocalState` values only |
| `accountUidsHashed` | when CS-03/DEV-03 | SHA-256 of uid, never raw uid in shared artefacts |
| `crossAccountLeak` | when CS-03/DEV-03 | `none` or description without PII |
| `logArtefactPaths` | optional | allowlisted logcat/app logs only; no PDF bytes |
| `screenshotPaths` | optional | no GSTIN, invoice, or personal photos |
| `blockers` | yes | empty array only when executed and passed later |
| `prohibitedActionsConfirmedAbsent` | yes | must include `eas-build`, `play-upload`, `firebase-deploy`, `production-fallback` |

Wave 1 envelope on disk: `tools/grin-acceptance/device/wave1-pending-envelope.json` with `executed: false` and `status: device_pending`.

## Native scripts (not executed)

Run only after a later, separate device authorization. Until then, each script exits 2.

| Script | Matrix IDs | Expected extra fields |
|---|---|---|
| `tools/grin-acceptance/device/print-pending.sh` | DEV-01…DEV-06, PLAY-01…PLAY-02 | prints status only |
| `tools/grin-acceptance/device/collect-dev01-process-death.sh` | DEV-01, CS-01 | `networkSteps`, `issuedNumbersObserved`, `outboxStatesObserved` |
| `tools/grin-acceptance/device/collect-dev02-talkback.sh` | DEV-02, G6-R02 | `talkbackVersion`, `screenshotPaths` (chrome-only if possible) |
| `tools/grin-acceptance/device/collect-dev03-account-switch.sh` | DEV-03, CS-03 | `accountUidsHashed`, `crossAccountLeak` |
| `tools/grin-acceptance/device/collect-dev04-pending-deletion.sh` | DEV-04 | deny codes observed (`forbidden`) without existence leak notes |
| `tools/grin-acceptance/device/collect-dev05-airplane.sh` | DEV-05, CS-01 | `networkSteps` |
| `tools/grin-acceptance/device/collect-dev06-a11y.sh` | DEV-06 | focus-order notes, no PII |
| `tools/grin-acceptance/device/collect-play01-default-off.sh` | PLAY-01 | `buildChannel=play-installed`, GRIN entry hidden |
| `tools/grin-acceptance/device/refuse-release-actions.sh` | all | asserts this environment will not call EAS/Play/deploy |

### Manual procedure (authorized later — do not run in this programme)

DEV-01 / CS-01 outline:

1. Install an **authorized** development build (not Play production; not EAS from this branch).
2. Sign in as owner A on an active ledger with GRIN still default-off unless a later activation design says otherwise. Wave 1 does not enable admission.
3. Capture a receipt offline (airplane mode). Confirm local `issuedNumber` is null.
4. Force-stop the app (process death). Do not uninstall.
5. Reopen, reconnect, wait for outbox drain.
6. Record `issuedNumbersObserved`. Pass later only if length is 1 and reconcile/replay did not allocate a second serial.

DEV-02 outline: enable TalkBack; walk receiving, inspection, amendment, EWB, return, pack-export screens when they exist; store spoken labels, not document contents.

DEV-03 outline: queue work as A; switch to B; confirm A's outbox is neither displayed nor dispatched; switch back to A without reusing B's `dispatchGeneration`.

DEV-04 outline: pending_deletion user; attempts to register/upload/export denied; no receipt existence leak.

PLAY-01 outline: Play-installed binary; `isGoodsEvidenceEnabled()` remains false; no GRIN hub tile / routes.

These outlines are not evidence.

## File-IO / pack closeout additions (still `device_pending`)

See `docs/release/packets/C_DEVICE_CHECKLIST.md` for the expanded later
device list: picker/PDF/camera, offline capture, process death, account
switching, upload interruption, receipt mutations, evidence export,
languages, TalkBack, low-memory operation, and existing diary/auth/save/PDF
regressions. Native RSS/PSS for 15 MiB originals is not claimed from
FileHandle unit tests.

## Wave 1 result

| Gate | State |
|---|---|
| DEVICE ACCEPTANCE | `device_pending` |
| PLAY-INSTALLED ACCEPTANCE | `play_pending` |
| G6 | not complete |
| Billing | not authorized |
| Public release | not authorized |
