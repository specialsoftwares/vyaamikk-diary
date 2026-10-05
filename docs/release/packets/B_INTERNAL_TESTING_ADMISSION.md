# Packet B — Proposed controlled Internal Testing admission

Status: **review only**. This closeout does **not** remove the store-runtime
block and does **not** authorize an Internal Testing build.

## What the store-runtime block does today

`isGoodsEvidenceBlockedByStoreRuntime()` is true when
`env.runtimeKind === "store-or-standalone"` (Play-installed / release binary:
`RuntimeSignals.isDev === false` and `appOwnership` is not `"expo"`).

`isGoodsEvidenceEnabled()` returns false whenever that block is true, even if
`EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED === "1"`.

A later Play-installed Internal Testing binary **would still hide GRIN** unless
a later, separately approved change alters that predicate. This assignment does
not alter it.

## Planned Play Internal Testing artifact

The artifact intended for Play Internal Testing is a **production-profile AAB**
(`eas.json` `build.production.android.buildType` is `app-bundle`).

An **APK** (`build.preview` / `build.development` `buildType: apk`) is a
**separate device-test artifact**. It is not the Play Internal Testing upload
and must not be labelled as one.

There is **no trustworthy Play-track signal inside the app**. Do not read
Internal Testing vs production from Play Console, installer metadata, or a
client-invented channel flag as a security control.

## Proposed later test admission (unapplied)

Do not apply these in this assignment.

1. **Build configuration (visibility only).** A separately reviewed production
   profile for the Internal Testing AAB may set `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`
   to `"1"` **and** a later approved change may narrow
   `isGoodsEvidenceBlockedByStoreRuntime()` so that this specific reviewed
   binary can show GRIN UI. Client configuration controls **visibility**. It is
   not authorization.
2. **Server-controlled tester admission (security boundary).** Packet A
   Firestore `goodsEvidenceAdmission/runtime` (and callables) allow
   `newCommands` / `reconciliation` only for seeded tester uids. Everyone else
   remains fail-closed even if the APK/AAB shows GRIN. Backend authorization
   remains the security boundary.
3. **Default-off for production tracks.** Internal Testing is not production
   admission and is not public release. Tracks that are not this reviewed
   Internal Testing AAB stay blocked.
4. **versionCode.** 23 is not reserved. Any later Internal Testing upload needs
   a fresh complete Play inventory and approval of the actual build source.
5. **Store listing / Play Console.** Separate authorization. This packet does
   not create tracks, testers, or drafts.

## What stays HOLD

- Removing `isGoodsEvidenceBlockedByStoreRuntime` in this closeout.
- EAS/native build/prebuild/OTA.
- Play upload, testers, or track promotion.
- Live Rules/Functions/Storage/IAM/secrets/flags.

A Play-installed GRIN Internal Testing run remains `play_pending` until those
later approvals exist.
