# Packet B — Proposed controlled Internal Testing admission

Status: **review only**. This closeout does **not** remove the store-runtime
block and does **not** authorize an Internal Testing build.

## What the store-runtime block does today

`isGoodsEvidenceBlockedByStoreRuntime()` is true when
`env.runtimeKind === "store-or-standalone"` (Play-installed / release APK-AAB:
`RuntimeSignals.isDev === false` and `appOwnership` is not `"expo"`).

`isGoodsEvidenceEnabled()` returns false whenever that block is true, even if
`EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED === "1"`.

So a later Play-installed Internal Testing binary **would still hide GRIN**
unless a later, separately approved change alters that predicate.

## What would need to change for a later approved Play-installed GRIN test

Do not apply these in this assignment.

1. **Keep default-off for production tracks.** Internal Testing is not production
   admission and is not public release.
2. **Replace or narrow the store-runtime block** with an explicit allowlist, for
   example:
   - allow GRIN only when `runtimeKind === "store-or-standalone"` **and** a
     separately reviewed channel signal is Internal Testing **and** the public
     env is `"1"`; **or**
   - keep the block and test GRIN only on a development client / Expo Go is
     already insufficient for Play-installed proof.
3. **Backend.** Packet A exports + admission doc allowing only seeded tester
   uids. Everyone else remains fail-closed.
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
