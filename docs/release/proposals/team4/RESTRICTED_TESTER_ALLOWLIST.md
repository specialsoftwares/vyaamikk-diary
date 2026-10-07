# Restricted tester allowlist (SOURCE) — not enablement

**Not authorization.** No tester UID invention. Empty/absent
`PLAY_BILLING_TESTER_UIDS` **denies all** even if billing were enabled.
Hidden buttons, Internal-track membership, and client purchase-entry `"0"`
are **not** backend authorization.

Combined READ-ONLY: `c45518a` (application `56f2040`). Do not build `520f9f9`.
Owner supplies Firebase Auth UIDs **privately**. **Do not commit UIDs,
emails, or a filled testers file.**

## Why Internal track / hidden button is not enough

`PLAY_BILLING_ENABLED === "true"` on deployed `prepareAndroidBillingAccount`
and `validateAndActivateAndroid` would accept **every authenticated caller**,
not only Internal testers, unless the UID allowlist also passes. Client
`EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` does not bind the callable.

## JSON / env input format (no secrets in git)

One Functions env or Secret Manager string: **`PLAY_BILLING_TESTER_UIDS`**.

Firebase Auth **UID** strings only. Play license-tester **emails** are a
different Console list and **must not** be stored in this variable.

### CSV (env)

```
PLAY_BILLING_TESTER_UIDS=uidOwnerExample,uidTesterOneExample
```

Comma-separated. Trimmed. Duplicates collapsed. Empty / whitespace-only →
deny all.

### JSON array

```
PLAY_BILLING_TESTER_UIDS=["uidOwnerExample","uidTesterOneExample"]
```

### JSON object (recommended for Secret Manager)

```json
{
  "uids": [
    "uidOwnerExample",
    "uidTesterOneExample",
    "uidTesterTwoExample"
  ]
}
```

Accepted object keys (first match wins): `uids`, `firebaseUids`,
`testerUids`, `PLAY_BILLING_TESTER_UIDS`.

A JSON string scalar is treated as a single UID.

### Fail-closed rules

| Input | Effect |
|---|---|
| Absent / `""` / `{}` / emails-only object | Deny **all** |
| Token containing `@` (CSV or JSON) | Error `play_billing_tester_allowlist_email_not_uid` (do not silently treat email as UID) |
| Malformed JSON | Error `play_billing_tester_allowlist_malformed` |

Private owner file (example only — **do not add a filled copy to git**):

```json
{
  "uids": ["REPLACE_WITH_FIREBASE_AUTH_UID"]
}
```

Bind later with Secret Manager / Functions env. Never paste UIDs into
packets, commits, or Play instructions.

## Implemented in this tree (still fail-closed)

`functions/src/billing/google/playConstants.ts`

- Prepare + validate callables: enablement check **then**
  `assertPlayBillingTesterAllowed(request.auth.uid)`.
- Production `validateAndActivateAndroid`, `androidRtdn`, and
  `scheduledBillingReconciliation` Android revalidator set
  `enforceRestrictedTesters: true` so RTDN/reconciliation **cannot grant**
  when the resolved UID is missing from the list (empty list denies all).
- Voided-purchase **revocation** is not blocked by the allowlist (fail-closed
  on entitlement removal).

Tests: `npm run test:billing-play-constants` and the restricted-grant block
in `npm run test:billing-google-play`.

Does **not** enable billing. Does **not** deploy. Does **not** seed UIDs.

## Residuals

- Live Pub/Sub / androidpublisher inspect this continue: **NOT RUN**.
- iOS callables: not in this Play restriction.
- Client purchase-entry `"0"` on ordinary Internal GRIN (`eas.json`). A
  billing-test binary is a **separate later profile/SHA** (Team 3).
- GRIN Functions / admission ≠ Play billing.

## Activation (later owner approval — not now)

1. Freeze a billing-test AAB with purchase-entry `"1"` (not the ordinary
   Internal GRIN binary). Ordinary GRIN AAB stays `"0"`.
2. Owner names license testers in Play Console **and** corresponding
   Firebase UIDs in private `PLAY_BILLING_TESTER_UIDS`.
3. Only then consider `PLAY_BILLING_ENABLED=true` on those Functions.
4. Disablement: unset enablement; next binary keeps purchase-entry `"0"`.
   In-flight Play purchases are not cancelled by a Functions gate.
