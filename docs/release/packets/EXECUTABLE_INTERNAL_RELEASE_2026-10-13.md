# Executable Internal release packet — 13 October 2026

This packet prepares the next actions. It does not authorize a merge, a
Functions deploy, an EAS build, a Play upload, billing activation, or a purge.

The next GRIN / letterhead Internal build stays billing-off.

## 1. Candidate

| Item | Value |
|---|---|
| Repository | `specialsoftwares/vyaamikk-diary` |
| Pull request | **#33**, open, mergeable |
| Head branch | `feature/unified-material-movement-aso` |
| Merge target | **`integration/grin-g1-g5-source`** at `1be1daedc67f4ef59f579a92c1b7262d1af5904c` |
| Not the target | `main` |
| Dependency source | **`53cfe412d7c62aaf6b5bfe379f6cc39cfeeed631`** |
| Canonical CI | Run **`38294284394` SUCCESS**, job **`verify` `114961527836`** (20m15s), on **`53cfe41`**. |
| Earlier application CI | **`38269047797`** / verify **`114878446537`** SUCCESS on **`c8cdbc5`**. That commit is an ancestor. It is not the current pull-request head. |

`53cfe41` changes `functions/package-lock.json` and the old-client / new-client
register emulator. `git diff --stat c8cdbc5..53cfe41 -- functions src app.json eas.json app firebase.json`
is only the Functions lockfile. `app.json` versionCode remains **24**.

This packet is documentation. The pull-request head after this file is
committed includes `53cfe41` and does not by itself change Functions source,
the app, or `app.json`. Merge that head into `integration/grin-g1-g5-source`.
Do not merge `c8cdbc5` or `53cfe41` alone and call it the current pull request.

## 2. Functions dependency

Isolated install only. No `npm audit fix --force`. No major upgrades.
`firebase-functions` stays **6.6.0** (`express` `^4.21.0`).

| Package | Before | After | Why it moved |
|---|---|---|---|
| express | 4.22.2 | **4.22.3** | Compatible release; depends on `qs` `~6.16.0` |
| body-parser | 1.20.5 | **1.20.8** | Compatible release; depends on `qs` `~6.16.0` |
| qs | 6.15.2 | **6.16.0** | Advisory fix inside the existing range |
| side-channel | 1.1.0 | **1.1.1** | Required by `qs` `^1.1.1` |

Committed lockfile sha256:
`f5ebda2224b089915161f89192516011d4d9f03d200308f2c553c59adb11228d`.
`functions/package.json` is unchanged
(`f02ab00c7866bae92745c721f39ffdd31a8b117b69907b4a4f1a07efffcaa616`).

Advisories on the old `qs` 6.15.2: GHSA-4mjr-xmp4-gh2g and GHSA-x5fp-wj9c-mxmx
(query-string denial of service). Express mounts the extended query parser,
which calls `qs.parse`, before the route handler. Firebase callable
authentication reads the Authorization header inside that handler. A local
benign request `GET /callable?a=1` with no Authorization header showed
`req.query` already set before the handler ran. That is package presence plus
pre-auth parsing.

No crash payload was sent. An unauthenticated crash is **not** claimed from
the dependency listing or from that benign request.

body-parser GHSA-v422-hmwv-36x6 applies when an invalid `limit` is configured.
The Functions runtime passes numeric limits. body-parser was still moved to
1.20.8 because that is the release express 4.22.3 resolves, and it pulls the
fixed `qs`.

### Local checks on the refreshed modules

| Check | Result |
|---|---|
| `npm --prefix functions run build` | pass |
| packaging unit + hash parity | pass |
| `test:goods-evidence-g1-emulator` (includes register parity and the old/new client case) | pass |
| `test:goods-evidence-g1-functions-emulator` (seven callables) | pass |
| `test:resolve-or-create-phone-emulator` | pass |
| billing transaction, GST compliance, Google Play, Apple, maintenance emulators | pass |

Those billing and phone checks are regression coverage for the shared
Functions install. They do not authorize deploying the billing or identity
functions.

## 3. Order

Do these in order. Each later step waits for the earlier approval.

1. Dependency correction and validation. Source is `53cfe41`. Canonical CI **`38294284394` SUCCESS**.
2. Approved merge of the **current** PR #33 head into `integration/grin-g1-g5-source`. Not into `main`. Not `c8cdbc5` alone.
3. Fresh read-only live inspection, then approved deploy of the seven GRIN functions from the merged source. Record the platform archive after deploy.
4. Fresh Play bundle inventory, then update `app.json` versionCode to the next unused code. Do not assume 25.
5. Freeze that Android source and obtain a new canonical CI on that exact commit.
6. Approved EAS `internal-grin` build from that frozen commit, artifact check, then approved Internal upload.

Phone acceptance happens after that AAB is installed, against the version on the OnePlus 12R. Do not uninstall or clear data. Host tests do not close device rows.

## 4. Backend scope, when separately approved

Fresh live inspection on 13 October 2026: **NOT RUN**. Firebase CLI is logged
in as `support.vyd@specialsoftwares.com` and returned "credentials are no
longer valid". `gcloud auth list` has no active account. The 2026-10-06 pilot
report is history, not a new inventory. Do not treat the seven functions as
absent.

Prepared source package, after `npm --prefix functions run build`, using the
`firebase.json` ignore list (`node_modules`, `.git`, firebase debug logs,
`*.local`). Content sha256 of path plus file bytes:

`9d1f7a7b057814618b5f376995897affd162160dfb57de9c72e08c46f5481be2`

540 files. Identity: source `53cfe41`, lockfile sha256
`f5ebda2224b089915161f89192516011d4d9f03d200308f2c553c59adb11228d`.

The platform-generated archive identity does not exist until a deploy. It is
**PENDING** and must be recorded separately from this prepared hash.

Deploy, only after approval, from a clean checkout of the merged source,
firebase-tools **14.20.0**, no Functions dotenv file:

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --only functions:grinRegisterGoodsReceipt,functions:grinReconcileCommand,functions:grinMutateGoodsReceipt,functions:grinReadGoodsReceipt,functions:grinReserveEvidence,functions:grinBeginEvidenceUpload,functions:grinUploadEvidence
```

Seven names, region `asia-south1`, project `vyaamikk-diary`. Do not deploy
Firestore rules, Storage rules, billing functions, or identity functions.
Do not use `gcloud functions deploy` without `--source`. The helper
`PINNED_APP_SHA` is still `540e07a` and is the wrong checkout for this source.

Before and after deploy, read back runtime, entry point, service account,
ingress, scaling, secrets, memory, timeout, and IAM. Environment edits, if
the gate must be restored, use Functions v2 `PATCH` with
`updateMask=serviceConfig.environmentVariables` only. Compare every other
environment key. Do not replace the whole environment from a dotenv file.

### Client compatibility already proved in the emulator

Old clients omit `reportedArrivalPrecision` and send `online`, `offline`, or
`late_entry`. New clients send `captureProvenance: "unknown"` and
`reportedArrivalPrecision: "date"` with a calendar date. Both committed
through `GoodsEvidenceRegisterAdapter` on the Firestore emulator, and the
packaged `registerBodyError` accepted them. Register parity passed, so the
Functions copy matches. The callable emulator then executed all seven
functions with authenticated requests. Label: **FIRESTORE_EMULATOR** /
**EMULATOR**. Not live. Not a phone.

## 5. Rollback after new clients exist

`540e07aa07f376716484adb879ce66cb9fb170ce` does not accept
`captureProvenance: "unknown"` or a date-precision arrival. Once an Internal
build that sends those fields is installed, redeploying `540e07a` is not a
transparent rollback. Those clients would be rejected.

Compatible fallback: keep the new payload support in the deployed source.
If that source must be turned off, set `GRIN_GOODS_EVIDENCE_FUNCTIONS=false`
on the same seven functions with the PATCH mask above. Leave every other
environment value in place.

That disablement does not delete queued commands, receipt originals, evidence
objects, or on-device outbox rows. Do not delete those records to make a
rollback look successful.

Recovery requires a Functions package that still accepts both payload
generations, deployed with the seven-name command above, then a PATCH of the
gate back to `true` if the product should accept writes again. Clients keep
their queued commands until that package is serving.

## 6. Android build, still not approved

Installed Internal remains `7c938f8` / versionCode **24**. `app.json` is still
24. The next code is **PENDING** a fresh Play bundle explorer read.

`internal-grin` stays:

- `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` `"0"`
- `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"`
- `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` `"1"`
- `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` `"1"`
- `autoIncrement` false

Do not build from `53cfe41` if step 4 changes versionCode. The AAB comes from
the step 5 freeze and its own CI.

## 7. Payments — source is prepared, Console is not inspected

No payments activation and no commercial declaration in this packet.

Source catalog, not a live Play price:

| Product | Base plans | Source paise |
|---|---|---|
| `vyd_starter` | monthly, quarterly, yearly | 9900, 24900, 79900 |
| `vyd_professional` | monthly, quarterly, yearly | 24900, 64900, 199900 |
| `vyd_business` | monthly, quarterly, yearly | 49900, 129900, 399900 |

There is no separate GRIN product. `GRIN_INCLUDED_IN_EXISTING_PLANS` is true.
Storage caps in source: Starter 1 GiB, Professional 3 GiB, Business 10 GiB.
`PLAY_BILLING_ENABLED` must be the string `true` or the server stays closed.
An empty `PLAY_BILLING_TESTER_UIDS` list denies everyone. The key's live
presence was last noted on 2026-10-06 and was **not** re-read today.

Play Console, Android Publisher, and RTDN were **NOT RUN** today. Prior
Publisher calls returned 403. Do not use a Firebase token as Android
Publisher. Do not call an uninspected screen empty or complete.

### Owner-only access or screenshots

1. Play Console → Settings → License testing. Add the Google account that will exercise a purchase. License testers are configured there, not in the app and not in Firebase.
2. Play Console → Monetize → Subscriptions. Show `vyd_starter`, `vyd_professional`, and `vyd_business`, each with base plans `monthly`, `quarterly`, and `yearly`, and the price Play actually has. Do not create a GRIN product.
3. Play Console payments profile: business identity, bank account, and tax status.
4. After a later billing-on build, one completed purchase in the app with that license-test account, showing the test payment method in the purchase sheet. Internal testing membership alone does not make a purchase free.
5. Real-time developer notifications: the Play Console notification setting and the Pub/Sub topic. The 2026-10-06 topic count is not a fresh inspection.
6. `firebase login --reauth` for `support.vyd@specialsoftwares.com`, so the seven live functions can be listed before any deploy. Do not paste passwords, one-time codes, or tokens into chat.

Customers cannot buy anything in the current or prepared billing-off build.
