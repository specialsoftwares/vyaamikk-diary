# Minimal live-Rules compatibility artifact (not deployed)

Status: source proposal only. This file does not authorize a Rules deploy.

## Fresh baseline (read-only export)

- CLI user: `support.vyd@specialsoftwares.com`
- Project: `vyaamikk-diary`
- Method: `GET https://firebaserules.googleapis.com/v1/projects/vyaamikk-diary/releases` then `rulesets/{id}`
- Export metadata: `docs/release/rules-compat/baseline/META.json`

| Surface | Ruleset | sha256 | Drift vs Continuation 3 |
| --- | --- | --- | --- |
| Firestore `cloud.firestore` | `9c02e187-bd1c-4a5f-bdcc-d8f070e0a5b2` | `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2` | none |
| Storage `vyaamikk-diary.firebasestorage.app` | `a2a0ddf7-9746-4dd2-bd48-29c9abc0e41f` | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` | none |

Canonical future quota Rules remain `firestore.rules` at the repo root. Do not replace them with this older live file. Do not silently deploy the full candidate ruleset.

## Proposed patch (billing-off internal)

File: `docs/release/rules-compat/proposed/firestore.rules`

sha256: `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`

Diff against live baseline only:

1. `_saveLocks` owner read allows missing documents (`resource == null || resource.data.userId == uid`).
2. Owner read of `users/{uid}/subscription/status` (missing docs allowed by `isOwner`). Client create/update/delete denied.
3. Owner read of `users/{uid}/subscription/usageCurrent`. Client create/update/delete denied.

Out of scope: recursive wildcards, client entitlement writes, Option-C usage mutations, quota activation, billing deploy, App Check Rules fields (`request.appCheck` does not exist).

`enforcement-true` accounts are outside this billing-off compatibility configuration. The patch does not grant client `usageCurrent` writes, so an enforcement-true ordinary CREATE that requires a usage mutation stays denied. Do not silently flip those documents or bypass that failure.

## Production Save vs CREATE

Ordinary `runAtomicBillableCreate` (`quotaConsumption: "required"`) reads `subscription/status`. On unmatched live Rules that read is `permission-denied`, not missing/off.

Letterhead parent CREATE (`quotaConsumption: "none"`) does not read status. Production Save still calls `beginCoordinatedSave` first, which reads `_saveLocks`. Live missing-doc lock reads fail because `resource.data.userId` is Null.

Independent execution of production `beginCoordinatedSave` with an existing **done** lock returns `return_done` with no new lease and zero remote writes. This artifact does **not** add `done → in_flight` lock transitions.

## Proposed deploy (later approval only)

- Target: Firebase project `vyaamikk-diary`, Firestore Rules only.
- Command (not run): `firebase deploy --only firestore:rules` using a reviewed copy of `proposed/firestore.rules` after a baseline drift comparison.
- Rollback: redeploy the hashed live baseline file from `baseline/firestore.rules`.
- Storage Rules: unchanged; no deploy proposed.

## Emulator

`npm run test:live-rules-compat` (Firestore emulator). Label: `LIVE_RULES_COMPAT`.

Result (2026-09-19, isolated combined candidate): **PASS**. Before: missing status/usage/lock reads denied; ordinary CREATE denied on status; letterhead CREATE compatible; `beginCoordinatedSave` blocked on missing lock. After patch: missing status/usage reads allowed empty; lock helper returns null; ordinary CREATE allowed with enforcement off; production `beginCoordinatedSave` proceeds; completion + same-ID replay returns `return_done` with no new lease; pending-secondary status/usage reads allowed; client status/usage writes still denied; enforcement-true ordinary CREATE still denied (no client usage writes). Identity uid mutation denied before and after.

Canonical `test:firestore-rules` still uses repo `firestore.rules`.
