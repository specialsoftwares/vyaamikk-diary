# Isolated acceptance approval sheet

Preparation only. This sheet does not authorise a build, installation, cloud write, deployment, merge, provider message, or public submission.

Public submission remains HOLD. Letterhead creation remains retired.

The proposed APK source commit is `f2ff65c9fb792d6b3928805d9d13480e9652aba1`. `main` had not advanced past that commit when this sheet was written. A later `main` does not change this proposed source commit unless a new sheet says so.

PR #38 is already merged at that commit. This sheet does not merge anything else.

## Outcomes, kept separate

| Outcome | State |
|---|---|
| Integrated source/CI | Passed on push run `40178555722`, job `121124455824`, head `f2ff65c9fb792d6b3928805d9d13480e9652aba1`. `test:all` 178/178 in 567.2s and `ci:verify` PASS. Pull-request run `40178539266` passed for head `d3d40283af4b609aebaeb4b38b8578dc7d88e8cd`. |
| Isolated cloud acceptance | Pending. No isolated project is recorded. |
| Physical-device acceptance | Pending. No APK exists for this source commit. |
| Provider evidence | Pending. No request has been sent. |

## What is already known

| Item | Value |
|---|---|
| Production Firebase project | `vyaamikk-diary`, project number `982505811909`. This is not the acceptance backend. |
| EAS project id in `app.json` | `00bb47ff-b22f-4a64-ace8-a0e7275fd2a1` |
| Package | `com.specialsoftwares.vyaamikkdiary` |
| Source `versionCode` | 30 |
| Profile | `acceptance-android`: internal APK, EAS environment `preview`, `autoIncrement` false |
| Compiled flags for that profile | `EXPO_PUBLIC_APP_MODE=production`, `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH=true`. GRIN store-admit and purchase-entry flags are absent. |
| Functions region in source | `asia-south1` |

## Scope A missing inputs

Scope A cannot be executed until every row below is filled. Choosing an id is not the same as creating the database or the project.

| Input | State |
|---|---|
| Isolated Firebase project ID | **Missing.** Selecting this id is an owner decision. Provisioning the project is a later authorised write and is not done. |
| Authority database ID | **Missing.** Selecting the id is separate from creating that named database and from seeding `authority/restore`. |
| Verified EAS account | **Missing.** The project id above is in source. The Expo account was not verified in this session. An older handoff names `@vydspecial2026/vyaamikk-diary`. That name is not a live verification. |
| Signing arrangement for this APK | **Missing.** Older upload and Play App Signing fingerprints are not this build. |
| Dedicated test device or Android user profile | **Missing.** It must contain no valuable Vyaamikk Diary data. Do not designate a phone that already has a Play or internal install of this package. |

The hold database is not a Scope A input.

## Scope A approval

Not signed. Signing this block would be the first execution request: provision the already chosen isolated project to phase 1, then build one `acceptance-android` APK from `f2ff65c9fb792d6b3928805d9d13480e9652aba1`.

| Field | Entry |
|---|---|
| Isolated project ID | |
| Authority database ID, selected | |
| Authority database, provisioned (yes/no) | |
| EAS account, verified | |
| EAS project id, verified | |
| Signing arrangement | |
| Dedicated device or profile | |
| Approver and date | |

Until this block is signed, no build and no cloud write is authorised.

### What phase 1 must include

Seeding Firestore does not install Functions. After the project and the authority database exist, Scope A still needs all of the following on that isolated project only:

- Phone Auth enabled.
- Pre-activation `firestore.rules`, `storage.rules`, and `firestore.indexes.json` from the source commit. Activated rules stay undeployed.
- Functions in `asia-south1`: `resolveOrCreateUserByPhone`, `claimMobile`, `mintClientAuthToken`, `readRestoreAuthorityWatermark`, `recordAgeAssessment`, `startAccountRecovery`, `completeAccountRecovery`, `recordProcessingPurpose`, `logoutAllDevices`, `ensureAccountDeletionJob`, `sealOwnerContent`, `openOwnerContent`.
- Leave billing, GRIN, deletion purge schedulers, content-key migration, and key retirement undeployed.
- `GRIN_GOODS_EVIDENCE_FUNCTIONS` unset. `INCLUDE_GRIN_IN_ACCOUNT_PURGE` false. `CONTENT_KEY_MIGRATION_ENABLED` unset. `RESTORE_PROTECTION_ACTIVE` unset. `RESTORE_WORKER_HOLD` unset. `RESTORE_HOLD_DATABASE_ID` unset.
- `RESTORE_AUTHORITY_DATABASE_ID` set to the selected authority database id. `FIRESTORE_DATABASE_ID`, if set, must be the primary database and must not equal the authority id.
- Runtime service account: datastore read and write on the primary database and on the authority database.
- Seed `authority/restore` with an integer watermark of at least 1, the erasure list, and withdrawn purposes. Then write an open reconciled `restoreControl/current` on the primary database with that same watermark. Mode absent or `{ required: false }`.

Secret and config names, with no values:

- `CONTENT_DATA_KEY` is bound to `sealOwnerContent` and `openOwnerContent`. `CONTENT_DATA_KEY_ID` stays unset. `CONTENT_DATA_KEYS` stays unbound.
- Recovery email binds `EMAIL_OTP_HMAC_SECRET`, `EMAIL_PROVIDER_API_KEY`, and `EMAIL_FROM_ADDRESS`. Phone login does not use those three.
- Bind those names in the isolated project's Secret Manager. Do not write the values into git, the APK, or this sheet. Do not copy production secret values unless a separate approval names that reuse.

Client configuration that must all name the same isolated project:

- Android native: `google-services.json` consumed by `@react-native-firebase`.
- JavaScript bundle: `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`, and `EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION` (`asia-south1`). The EAS `preview` environment supplies these at bundle time.
- Replacing `google-services.json` alone is not acceptance evidence. Before the build, compare the native file and every JavaScript value above. Abort if any project id is `vyaamikk-diary`, if any is empty, or if they disagree.
- Before installation, read the APK. The packaged native project id and the project id inlined in the JavaScript bundle must both equal the approved isolated project id.

The signing certificate's SHA-1 and SHA-256 must be registered on that isolated Android app before Phone Auth can succeed. Those fingerprints are missing until the signing arrangement is chosen. Record whether App Check is enforced on the isolated project. Source does not by itself prove that enforcement is off.

### Install safety

The APK uses the production package name. Use only the dedicated device or Android profile named in the Scope A approval. It must have no valuable app data.

An accidental install does not by itself prove that local records were destroyed. Data loss is established only from what actually happened: whether this package was already installed, whether its data was cleared, and whether unsynchronised files are still present. While that is being established, do not uninstall, clear storage, or reinstall. Preserve any surviving local data.

### Mutations

Every cloud write names the approved isolated project id and aborts if the target differs. There is no automatic instruction to close a fence on any other project.

If production was changed accidentally, stop further writes, record the exact project, document, and fields that changed, and escalate for an authorised incident response. Do not continue with a compensating write from this sheet.

## Scope B missing inputs

Scope B is not part of the Scope A request. It starts only after Scope A has been observed on the installed binary.

| Input | State |
|---|---|
| Hold database ID | **Missing.** Selecting the id is separate from creating that database. It must not be the authority database or `(default)`. |
| Activated rules deploy | Not requested. |
| `RESTORE_PROTECTION_ACTIVE=true` | Not requested. |

## Scope B approval

Not signed. Signing this block would be a later request: deploy `rules/activated/firestore.rules` and `rules/activated/storage.rules` on the same isolated project, create the selected hold database, seed `_restoreHolds/current`, and set `RESTORE_HOLD_DATABASE_ID` and `RESTORE_PROTECTION_ACTIVE=true`.

| Field | Entry |
|---|---|
| Same isolated project ID as Scope A | |
| Hold database ID, selected | |
| Hold database, provisioned (yes/no) | |
| Approver and date | |

Setting `required: false` does not restore access under the activated rules. Rollback, if later authorised, is a closed primary fence and closed outside holds, with those rules left in place. That rollback is not authorised here.

## Outside both scopes

Production deployment, any further merge, public distribution, content-key migration, production inventory, purge, and key destruction.

## Artifact evidence

Leave blank until the APK exists. Emulator results and versionCode 24 do not fill these fields.

| Field | Value |
|---|---|
| Source commit | `f2ff65c9fb792d6b3928805d9d13480e9652aba1` until a new sheet changes it |
| EAS build ID | |
| APK SHA-256 | |
| Signing-certificate SHA-256 | |
| versionCode read from the APK | |
| Native project id inside the APK | |
| JavaScript `EXPO_PUBLIC_FIREBASE_PROJECT_ID` inside the APK | |
| Compiled refresh flag inside the APK | |

Run the device sheet in `CONTROLLED_ACTIVATION.md` against that APK only. A missing capture is a failure. Do not substitute an emulator or an older artifact.

## Provider evidence

No message is sent by this sheet. Local account deletion, Firebase Auth deletion, cloud purge, backups, and provider retention are separate claims.

| Claim | What would resolve it | Who can supply it | State |
|---|---|---|---|
| Local account deletion on the device | The device sheet shows that account's key and local rows removed, and another account's rows kept. | Device tester, after Scope A | Pending. No APK. |
| Firebase Auth user removal | Attributable evidence that this application's deletion flow removed that Auth user. An Auth-user absence record alone does not prove the flow did it. Use an existing attributable record, or leave this pending for a separately authorised disposable-account test. | Project owner, only after that separate authorisation | Pending. This sheet does not authorise the test. |
| Cloud purge of Firestore and Storage for that account | Job record plus before/after listing for that uid, tied to the deletion flow. | Project owner, only under a separate purge authorisation | Pending. Purge is outside Scope A and Scope B. |
| Backups and point-in-time recovery | Whether a backup or PITR copy of that user would survive the app deletion job. | Firebase project owner | Pending. No request sent. |
| Storage generations and soft-deleted objects | Listing that includes noncurrent generations for that uid. | Cloud Storage operator | Pending. No request sent. |
| Crashlytics retention after consent withdrawal | Retention statement after collection is turned off. | Firebase Crashlytics owner | Pending. No request sent. |
| Email-provider retention for OTP and recovery mail | Provider retention for the test account's messages. | Email-provider operator | Pending. No request sent. |
| Play account-deletion page and Data Safety form | Confirmation they match the current deletion behaviour. | Play Console owner | Pending. No submission. |
