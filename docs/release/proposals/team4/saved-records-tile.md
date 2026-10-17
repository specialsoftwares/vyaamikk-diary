# Team 4 proposal — Saved Records GRIN hub tile

Owner of `app/(app)/(tabs)/saved-records.tsx`: coordinator.
Team 4 does not edit that file.

## Proposed tile (gated)

When `isGoodsEvidenceEnabled()` is true **and** `isGoodsEvidenceBlockedByStoreRuntime()` is false, add a hub tile:

- `key`: `grin`
- `labelKey`: `grin.listTitle` (already in all locales)
- `icon`: `clipboard-check-outline` (or coordinator’s chosen MaterialCommunityIcons name)
- `accentKey`: `payment` (same family as purchase orders) unless coordinator prefers a dedicated accent
- `count`: GRIN receipt count from the Wave 2 adapter (Wave 1: `getGrinFixtureRepository().list().length` is a labelled fake — do not ship that count on production admission)
- `preview`: latest issued GRIN number, or `grin.offlinePendingBanner` when the latest local state is not `issued`
- `onPress`: `router.push("/(app)/grin")`

When the flag is off, or the runtime is store-or-standalone, omit the tile entirely. Do not show a disabled tile that leaks the feature.

## Copy

Do not invent GRIN pricing or quota on this tile. If a quota caption is later required, wait for the unresolved pricing/quota policy.

## i18n

`grin.listTitle` / `grin.listSubtitle` / `grin.offlinePendingBanner` already exist in `en`, `hi`, `ta`, `te`, `gu`.
