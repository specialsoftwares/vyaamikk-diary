# Packet B — Production-profile Internal Testing AAB (unapplied)

Status: **review only**. This closeout does **not** remove the store-runtime
block and does **not** authorize an Internal Testing build. Does not authorize
EAS, Play upload, or OTA. Purchase-entry stays `"0"`. Encrypted PDF backup
out of scope.

There is **no trustworthy Play-track signal inside the app**. Do not read
Internal Testing vs production from Play Console, installer metadata, or a
client channel flag as a security control.

`android.versionCode` **23 in `app.json` is not reserved.** Last Play inventory
(2026-10-01, read-only) had Internal Testing **vc22 Active**; **23 absent**.
Recheck the complete bundle list immediately before selecting a code.

## 1. Artifact classes (do not mix labels)

The artifact intended for Play Internal Testing is a **production-profile AAB**
(`eas.json` `build.production.android.buildType` is `app-bundle`).

| Artifact | Profile | `buildType` | Use |
|---|---|---|---|
| Play Internal Testing upload | `eas.json` `build.production` | `app-bundle` (AAB) | Only this is the Internal Testing candidate |
| Device sideload / USB | `build.preview` or `build.development` | `apk` | Separate **device-test** artifact. Not an Internal Testing upload |

Do not submit a preview APK to Internal Testing. Do not call a local APK a
Play-installed run.

## 2. Exact source/config change for testers to **see** GRIN on a store-runtime build

Today:

- `isGoodsEvidenceBlockedByStoreRuntime()` is true when
  `env.runtimeKind === "store-or-standalone"` (Play-installed / release:
  `RuntimeSignals.isDev === false` and `appOwnership` is not `"expo"`).
- `isGoodsEvidenceEnabled()` returns false **before** reading
  `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` whenever that block is true.
- `eas.json` production/preview do **not** set `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`.

**Proposed later patch (do not apply now).** Visibility only. Server admission
(Packet A §6) remains the security boundary.

1. `eas.json` `build.production.env` (this Internal AAB only):

   ```json
   "EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED": "1",
   "EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT": "1"
   ```

   Keep `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED": "0"` and
   `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED": "0"`.

2. `src/goodsEvidence/featureFlag.ts`:

   ```ts
   export function isGoodsEvidenceBlockedByStoreRuntime(): boolean {
     if (process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT === "1") {
       return false;
     }
     return env.runtimeKind === "store-or-standalone";
   }
   ```

   Isolation tests must keep asserting that **without** the admit flag, store
   runtime stays blocked even if `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED === "1"`.

This is a **build-time public env** baked into that AAB. It is not a Play-track
detector. If this AAB is promoted to production by mistake, GRIN **UI** could
appear; non-seeded uids still fail closed on callables/Rules.

**Do not** remove the store-runtime block globally without the admit flag.

## 3. Server-side tester admission (independent of app visibility)

Packet A §6. Seed only named tester Firebase uids:

`users/{uid}/goodsEvidenceAdmission/runtime` =
`{ schemaVersion: 1, newCommands: "allow", reconciliation: "allow" }`.

Everyone else omit or `deny`. Client flags cannot write this document.

Play licence-tester emails are **not** Firestore admission.

## 4. Clean build SHA and resolved public configuration

Build **only** from a later owner-approved SHA that contains:

- application `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` (or a fast-forward
  that preserves it),
- the Packet B visibility patch if that patch is approved,
- no dirty historical workspace.

Record after EAS (when authorized):

| Field | How |
|---|---|
| Git SHA | `eas build` JSON `gitCommitHash`; must match `git rev-parse HEAD` of the tagged commit |
| Working tree dirty | must be false |
| Profile | `production` / `app-bundle` / `distribution=store` |
| Resolved public env | from the **build worker** (profile env wins over remote on overlap, `eas-cli` merge order). Required: `EXPO_PUBLIC_APP_MODE=production`; purchase-entry `"0"`; quota-upsell `"0"`; GRIN flags only if the owner approved §2 |
| `expo.version` | `1.0.0` until owner changes it |
| versionCode | **chosen after** §5 inventory, written to `app.json` immediately before the build |

`app.config.js` only remaps `googleServicesFile`; it does not change
versionCode or those flags.

## 5. Fresh complete Play version inventory (required before versionCode)

Last read (2026-10-01, not current):

- Package `com.specialsoftwares.vyaamikkdiary`
- Bundles pager 1–9 of 9: **22 Active**; 20, 19, 17, 16, 15, 14, 13, 10 Inactive
- **21, 18, 23 absent** from Play AAB inventory
- Internal testing track Active, latest **Vc22** (uploaded 23 Sept 2026)
- Production track **Inactive**
- EAS vc21 finished but **not** in Play inventory

**Before selecting a code:** owner opens Play Console → App bundle explorer
(unfiltered) and records every versionCode + track + status. Choose an unused
integer **strictly greater** than the highest uploaded code. If 23 is still
unused it **may** be used; it is not reserved by `app.json`. If 23 has been
uploaded since 2026-10-01, increment.

Do not re-upload 22.

## 6. Signing roles and artifact verification

| Role | Holder | This packet |
|---|---|---|
| Play App Signing key | Google Play | Do not export |
| Upload key | EAS Android credentials for `@vydspecial2026/vyaamikk-diary` | Do not print fingerprints into git |
| Firebase Android app | `1:982505811909:android:784cb8df7f5523beea25ac` | Compare upload cert to Play + Firebase after build |

After a later authorized AAB:

1. Record AAB sha256 (`shasum -a 256` of the downloaded artifact).
2. `bundletool dump manifest` for `package` + `versionCode` + `versionName`.
3. Extract upload-cert SHA-1/SHA-256 via `apksigner` / Play App signing page
   (do not commit cert files).
4. Capture EAS `buildId` (historical vc22 was `72cb7254-0be9-4f92-a514-dbfab2b1150d`
   for a **different** SHA; do not reuse that id as this candidate).
5. Download and store the **mapping/ProGuard** file from the EAS artifact
   privately (not in git). Required for crash deobfuscation.

## 7. Install / upgrade from current Internal vc22

SQLite: `DB_VERSION = 10` with additive GRIN v10 tables/columns. vc22
(git `0da2f58`) is pre-GRIN tables. Upgrade must run `applyPendingLocalMigrations`
on first launch after install.

| Step | Pass |
|---|---|
| Device has Internal vc22 | Record version in Settings / `dumpsys package` |
| Install Internal AAB via Play (not sideload APK) | Play shows new versionCode |
| Cold start | Splash completes; no migration crash |
| Existing diary/PO/credit/letterhead rows remain | Open one of each; Save/PDF still work |
| Auth session | Same Firebase user or re-OTP; no cross-uid data |
| GRIN visibility | Hidden unless §2 shipped **and** this binary; if visible, Packet A admission still required to register |
| GRIN off binary | `isGoodsEvidenceEnabled()` false; no GRIN hub |

Clean-install on D2 is a separate row (Packet C).

## 8. HOLDs

- EAS/native build/prebuild/OTA
- Play create-release / upload / tester-list mutation
- Applying §2 in this assignment
- Main merge
