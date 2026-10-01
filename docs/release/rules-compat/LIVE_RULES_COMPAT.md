# Minimal live-Rules compatibility artifact

Status as of **2026-10-01 live export**: deployed Firestore Rules **match** `docs/release/rules-compat/proposed/firestore.rules`. This assignment **did not** deploy Rules, Storage, or Functions. This file does not authorize a further Rules deploy.

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

## Fresh baseline comparison (read-only, 2026-09-19T20:55Z)

- CLI user: `support.vyd@specialsoftwares.com`
- Project: `vyaamikk-diary`
- Method: `GET firebaserules.googleapis.com/v1/projects/vyaamikk-diary/releases` then `rulesets/{id}` (token refresh via Firebase CLI; no deploy)
- Result: **no drift**. Live Firestore remains ruleset `9c02e187-bd1c-4a5f-bdcc-d8f070e0a5b2` sha256 `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`. Live Storage remains `a2a0ddf7-9746-4dd2-bd48-29c9abc0e41f` sha256 `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5`. Baseline files were **not** replaced.

Proposed artifact hash **confirmed**: `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`.

## Fresh live export (read-only, 2026-10-01)

- CLI user: `support.vyd@specialsoftwares.com` (session restored; no interactive reauth in this assignment)
- Project: `vyaamikk-diary` (number `982505811909`)
- Method: `GET firebaserules.googleapis.com/v1/projects/vyaamikk-diary/releases` then `rulesets/{id}` (existing Firebase CLI token; no deploy)
- Metadata: `docs/release/rules-compat/live-export-2026-10-01/META.json`
- Live Firestore: ruleset `a19b4a83-8b3e-4cf5-b8b8-e8d26e9704f9`, release update **2026-09-21T09:05:33Z**, source filename `docs/release/rules-compat/proposed/firestore.rules`, sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` — **identical to the proposed billing-off compat patch**. This is **drift vs the 2026-09-19 hashed baseline** (`9c02e187…` / `d8ee0abcd5…`), not vs the proposed file.
- Live Storage: ruleset `a2a0ddf7-9746-4dd2-bd48-29c9abc0e41f` unchanged, sha256 `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` (matches 2026-09-19 baseline).
- Repo-root `firestore.rules` sha256 `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` is **not** live.
- This assignment did **not** deploy the patch. Someone already published those bytes on 2026-09-21.
- Emulator: **not re-run**. Live Firestore bytes equal the proposed file already covered by `LIVE_RULES_COMPAT` PASS (2026-09-19). Do not treat that emulator PASS as a live-project mutation test.

Candidate compatibility assumption for billing-off internal: live Firestore is the hashed proposed patch (missing `_saveLocks` / `subscription/status` / `usageCurrent` owner reads allowed empty; client writes of those documents still denied). That is **not** whole-app security certification and **not** quota/enforcement-true compatibility.

Do **not** infer current compatibility from the 2026-09-19 export alone. The 2026-09-19 baseline remains a rollback artifact, not the current live Firestore.

## Exact later deploy / verify / rollback (not run)

Do **not** deploy from this packet. After a separate written approval:

1. Re-export live Firestore Rules with the same GET releases + rulesets method. Hash the live source. As of 2026-10-01 the live sha256 is `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` (proposed patch), **not** the 2026-09-19 baseline `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`. If a later export does not match the then-expected live hash, **stop**. Report the delta. Do not silently replace the baseline and do not deploy on top of an unreviewed live change. A same-hash re-deploy of the proposed file would be a no-op against the 2026-10-01 live Firestore.
2. Confirm `docs/release/rules-compat/proposed/firestore.rules` still hashes `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`.
3. Copy **only** that proposed file into the Firebase deploy working tree for Firestore Rules. Do **not** copy repo-root `firestore.rules` (canonical quota / `usageCurrent` writes).
4. Deploy Firestore Rules only: `firebase deploy --only firestore:rules --project vyaamikk-diary`. No Storage deploy. No Functions deploy. No flag changes. No production backfill. No App Check enforcement.
5. Verify on a billing-off account: missing `_saveLocks` owner read; owner read of missing `subscription/status` and `usageCurrent`; client create/update/delete of those documents still denied; ordinary `runAtomicBillableCreate` proceeds with enforcement off / missing usage; letterhead parent CREATE remains zero-quota; identity uid mutation still denied.
6. Rollback: deploy `docs/release/rules-compat/baseline/firestore.rules` (sha256 `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`) with the same `firebase deploy --only firestore:rules` command. Expect save lock/status reads to fail again for the new binary; keep local recovery data on device.

Canonical future quota Rules remain repo-root `firestore.rules`. They are a separate later approval.

## Emulator

`npm run test:live-rules-compat` (Firestore emulator). Label: `LIVE_RULES_COMPAT`.

Result (2026-09-19, isolated combined candidate): **PASS** for the hashed CREATE + begin/complete helper suite.

Before the patch: missing status/usage/lock reads denied; ordinary CREATE denied on status; letterhead CREATE compatible; `beginCoordinatedSave` blocked on missing lock.

After the patch: missing status/usage reads allowed empty; lock helper returns null; ordinary CREATE allowed with enforcement off; production `beginCoordinatedSave` proceeds; completion + same-ID replay returns `return_done` with no new lease; pending-secondary status/usage reads allowed; client status/usage writes still denied; enforcement-true ordinary CREATE still denied (no client usage writes). Identity uid mutation denied before and after.

This continuation adds production-caller coverage on the proposed patch phase: `saveComposerEntry` (first Save, completed steps, same-ID return_done, PDF failure + recovery without extra CREATE), `saveLetterheadCreateWithPdf` (PDF metadata + genuine mirror), and other ordinary families' `save*WithPdf` admission/completion paths. Native PDF and insights are injected; Firestore repositories, coordinator, and completed steps remain real.

Independent emulator re-run this continuation (2026-09-19, isolated combined candidate), including those production callers: **LIVE_RULES_COMPAT PASS**. After-patch production-caller checks recorded:

- `saveComposerEntry` first Save completes with PDF metadata
- `saveComposerEntry` same-ID return_done does not extra-CREATE
- `saveComposerEntry` PDF failure keeps base record
- `saveComposerEntry` PDF recovery does not extra-CREATE
- `saveLetterheadCreateWithPdf` PDF + genuine mirror
- `savePurchaseOrderWithPdf` / `saveCustomerCreditWithPdf` / `saveProfessionalPackWithPdf` complete

Scoped production-caller corrections (not Rules widening): skip `completeCoordinatedSave` on `return_done` when there is no lease/owner/processLockKey; `touchPersistentLock` no-ops unless `status === "in_flight"`; skip HTML builders when a PDF hook is installed so Node tests do not load i18next/react-native. Done-lock `done→in_flight` remains denied.

Boundary: emulator + MemorySqlite, not a device or live project. Do not treat emulator PASS as a Play-installed device result.

Canonical `test:firestore-rules` still uses repo `firestore.rules`.
