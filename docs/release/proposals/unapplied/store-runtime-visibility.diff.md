# Applied (Internal-GRIN profile) — Packet B visibility

Status: **applied on `eas.json` `build.internal-grin` only**, not on
`build.production`. Ordinary production/preview/development profiles stay
GRIN-off. Purchase-entry stays `"0"`.

This is visibility only. Server admission remains the security boundary.
Do not detect Internal Testing vs production from Play Console, installer
metadata, or a client channel flag.

## 1. Distinct `internal-grin` profile (not production.env)

The originally proposed production.env patch was **not** used. Promoting a
production AAB must not show GRIN UI. `internal-grin` copies production
app-bundle settings and sets:

```json
"EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED": "1",
"EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT": "1"
```

Do not add those keys to `build.preview` (APK) unless a later device-test
authorization says so. Preview APK is not the Internal Testing AAB.

## 2. `src/goodsEvidence/featureFlag.ts` (exact replacement)

Current:

```ts
export function isGoodsEvidenceBlockedByStoreRuntime(): boolean {
  return env.runtimeKind === "store-or-standalone";
}
```

Proposed:

```ts
export function isGoodsEvidenceBlockedByStoreRuntime(): boolean {
  if (process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT === "1") {
    return false;
  }
  return env.runtimeKind === "store-or-standalone";
}
```

`isGoodsEvidenceEnabled()` stays:

```ts
if (isGoodsEvidenceBlockedByStoreRuntime()) return false;
return process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED === "1";
```

No installer package, Play track, or `Application.getInstallReferrer` reads.

## 3. Test cases to add (do not weaken existing HOLD tests)

Keep the current store-runtime loop: every
`EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` value including `"1"` stays **off** when
the admit flag is unset.

Add, after apply:

1. Store runtime + `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1` + admit unset →
   blocked; `isGoodsEvidenceEnabled()` false.
2. Store runtime + `ENABLED=1` + `STORE_RUNTIME_ADMIT=1` → not blocked;
   `isGoodsEvidenceEnabled()` true. This does **not** grant backend access.
3. Store runtime + admit `"1"` + ENABLED unset/`"0"`/`"true"` → not blocked
   by store runtime, but `isGoodsEvidenceEnabled()` false →
   `GrinAdmittedSessionHost` `renderUnavailable`.
4. Development runtime unchanged: ENABLED `"1"` still required; admit flag
   does not enable GRIN by itself on Expo Go.
5. Source contract: `featureFlag.ts` still has no installer/Play-track API
   and no `__setGoodsEvidenceEnabledForTests`.
6. `eas.json` production still has purchase-entry `"0"` and quota-upsell `"0"`.

## 4. Honest unavailable for a visible but non-admitted account

After this patch, a store-runtime Internal AAB can **show** GRIN screens.
A signed-in account without
`users/{uid}/goodsEvidenceAdmission/runtime` `newCommands=allow` still
receives `policy_denied` on callables. The outbox already maps that to
`feature_not_admitted` (permanent).

Required UI on apply (not done in this slice): when the actionable failure
is `feature_not_admitted`, show the existing `grin.unavailableTitle` /
`grin.unavailableBody` EmptyState (or equivalent copy that GRIN is not
admitted for this account). Do not present it as a retryable network error
and do not invent a GRIN number.

`GrinAdmissionGate` `renderUnavailable` today covers **flag-off / no uid**.
It does not cover “flags on, server admission deny.” That gap is part of
this unapplied visibility change, not a reason to treat installer detection
as authorization.
