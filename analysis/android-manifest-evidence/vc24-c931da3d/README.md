# Android manifest evidence — vc24 AAB (EAS `c931da3d`)

Label: **NATIVE_ARTIFACT** (merged manifest read from the built bundle; no device run).

| Field | Value |
|---|---|
| Artifact | EAS build `c931da3d-4dcb-472e-9c63-f72217c6d95c`, profile `internal-grin`, STORE AAB |
| AAB SHA-256 | `dbda921d1da8b425aaa3f8b0556cf5e43665ab7bd189138a12c20d2b06bfd43d` (recomputed locally 2026-10-12; matches `docs/release/packets/grin-ops/NEXT_INTERNAL_UPLOAD_PACKET_VC24.md`) |
| Source | `7c938f836891411752e6fa6af8879ddfe275ab60` (ancestor of `a528de0`) |
| Package / version | `com.specialsoftwares.vyaamikkdiary` 1.0.0 / versionCode 24, minSdk 24, targetSdk 36 |
| Tooling | `bundletool 1.18.1 dump manifest`; `aapt2` (build-tools 36.0.0) `dump xmltree` on the re-rooted `base/` module for `res/xml/*` |
| Drift to `a528de0` | native-config-relevant diff is only `package.json`/`package-lock.json`: `@infinitered/react-native-mlkit-document-scanner@5.0.0` added. Its manifest contributions (ML Kit doc-scanner module dependency meta-data, Play services) are **not** in this artifact → EVIDENCE_PENDING for the next build. |

`AndroidManifest.merged.xml` in this directory is the full dump.

## Permissions (requested in artifact)

Declared in `app.json`: `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`.

Merged from Expo template / libraries: `INTERNET`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`, `VIBRATE` (template); `com.android.vending.BILLING` (expo-iap); `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` (netinfo); `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `c2dm.RECEIVE`, launcher badge permissions (expo-notifications / ShortcutBadger); `CAMERA` (expo-image-picker — used: `launchCameraAsync` in 4 source files); `USE_BIOMETRIC`, `USE_FINGERPRINT` (expo-secure-store — `requireAuthentication` unused in source); `READ_GSERVICES`, `BIND_GET_INSTALL_REFERRER_SERVICE` (Play services).

Absent (correct): `ACCESS_BACKGROUND_LOCATION`, `RECORD_AUDIO`, `READ_MEDIA_*`, `MANAGE_EXTERNAL_STORAGE`, `FOREGROUND_SERVICE_LOCATION`.

## Application attributes

- `android:allowBackup="true"`; `fullBackupContent="@xml/secure_store_backup_rules"`; `dataExtractionRules="@xml/secure_store_data_extraction_rules"`.
- Both rule files contain **only** `<include domain="sharedpref" path="."/>` + `<exclude domain="sharedpref" path="SecureStore"/>` (cloud-backup and device-transfer). Include-only semantics ⇒ databases (`SQLite/`), files and cache are **not** backed up; SharedPreferences other than SecureStore **are** (this includes the Firebase Auth Android persisted session store).
- No `android:usesCleartextTraffic`, no `networkSecurityConfig` ⇒ platform default (cleartext blocked on API 28+).
- No `https` App Links / `autoVerify`. MainActivity (`exported="true"`) VIEW/BROWSABLE filter for custom schemes `vyaamikkdiary` and `exp+vyaamikk-diary` (the second is added by `expo-dev-client`'s `withGeneratedAndroidScheme`).

## Exported components

| Component | exported | Source | Note |
|---|---|---|---|
| `.MainActivity` | true | app | launcher + custom-scheme deep links |
| `androidx.compose.ui.tooling.PreviewActivity` | **true** | `expo-dev-launcher` → `androidx.compose.ui:ui-tooling` (`implementation`, not debug-only) | **Unintended in release.** Reflectively invokes a `@Composable` named by Intent extra. Proposed removal: `plugins/withAndroidReleaseManifestHardening.js` (tools:node="remove"). |
| `com.canhub.cropper.CropImageActivity` | true | expo-image-picker → Android-Image-Cropper | no intent-filter; launched explicitly by the picker. Unverified whether `exported=false` breaks the cropper → OPTIONAL_FUTURE. |
| `com.google.firebase.auth.internal.GenericIdpActivity` / `RecaptchaActivity` | true | Firebase Auth SDK | fixed `genericidp://firebase.auth/` and `recaptcha://firebase.auth/` schemes; SDK-managed. |
| `com.google.android.gms.auth.api.signin.RevocationBoundService` | true (permission-guarded) | Play services | SDK-managed |
| `com.google.firebase.iid.FirebaseInstanceIdReceiver` | true (`c2dm.permission.SEND`) | FCM | SDK-managed |
| `androidx.work.impl.background.systemjob.SystemJobService` | true (`BIND_JOB_SERVICE`) | WorkManager | SDK-managed |
| `androidx.work.impl.diagnostics.DiagnosticsReceiver`, `androidx.profileinstaller.ProfileInstallReceiver` | true (`android.permission.DUMP`) | AndroidX | SDK-managed, shell-only permission |
| `expo.modules.clipboard.ClipboardFileProvider` | **true**, no `grantUriPermissions` | expo-clipboard | root limited to `cache-path .clipboard/` (see below) |

Other dev-launcher residue in the release artifact: `com.google.mlkit.vision.DEPENDENCIES=barcode_ui`, `GmsBarcodeScanningDelegateActivity` (not exported), ML Kit barcode registrars, Apollo GraphQL runtime.

## FileProviders and roots

| Authority (suffix) | exported | grantUriPermissions | Roots |
|---|---|---|---|
| `.FileSystemFileProvider` (expo-file-system) | false | true | `files-path .`, `cache-path .` — **whole internal files dir** (includes `files/SQLite/`) and cache |
| `.SharingFileProvider` (expo-sharing) | false | true | `external-path .`, `files-path .`, `cache-path .` |
| `.ImagePickerFileProvider` (expo-image-picker) | false | true | `files-path .`, `cache-path .` |
| `.cropper.fileprovider` (canhub) | false | true | `files-path cropper-internal/`, `external-files-path /`, `cache-path .`, `files-path .` |
| `.ClipboardFileProvider` (expo-clipboard) | true | — | `cache-path .clipboard/` |

Not referenced by any provider in this manifest: `res/xml/image_share_filepaths.xml` (`files-path image_provider/`).

Broad roots are SDK defaults. They are only exposable through URIs the app itself mints and grants (per-URI grants on explicit share/print intents); exposure therefore depends on the caller never passing an attacker-controlled path. Caller audit is Agent 2's scope (`src/services/share|pdf|storage`).

## Crashlytics / data collection meta-data (for Agent 3)

- `firebase_crashlytics_collection_enabled="false"` (native auto-collection off before JS consent).
- `app_data_collection_default_enabled="true"` (RNFirebase `firebase.json` default).
- `expo.modules.updates.ENABLED="false"`.
