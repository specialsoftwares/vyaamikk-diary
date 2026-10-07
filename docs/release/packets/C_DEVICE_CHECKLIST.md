# Packet C — Runnable device checklist (still unexecuted)

Native-device and Play-installed tests have **not** occurred. This is the
script the **owner or named tester** runs on hardware. Peak-memory / OOM-free
behaviour is not claimed from source or emulator.

Contract revision: `2026-10-02.wave2evidence`.
Who executes: owner/tester with D1 (vc22 upgrade) and D2 (clean) as in
`T2_DEVICE_UPLOAD_READINESS.md`. Coordinator/AI does not physically execute.

Tick only after the named device run. Use synthetic data.

## Pre-conditions (record, do not skip)

- [ ] Device IDs, Android version, RAM recorded
- [ ] Build identity recorded (Play versionCode **or** labelled APK sha256)
- [ ] Artifact class labelled (`PLAY_INSTALLED` vs `NATIVE_DEVICE` APK)
- [ ] Auth: real phone OTP **or** owner-verified Firebase test fixture
- [ ] GRIN backend: live callables + seeded admission **or** explicitly
      `backend_absent` (then GRIN register rows are blocked, not skipped as pass)

## C-01 Cold start and auth

1. Force-stop; reboot phone; open app.
2. Sign in with phone OTP (reviewer path: `+91 9000000000` / `654321` only if
   the live Firebase test-phone fixture is verified).
3. Complete onboarding if shown (name, business, consents).
4. Pass: main tabs reachable; legal date in-app still `2026-07-27`; no token
   printed.

## C-02 Existing diary / PO / credit / pack / letterhead / PDF

On the **upgrade** device (vc22 data):

1. Open one existing cash/diary entry, PO, customer credit, professional pack,
   letterhead.
2. Save without GRIN.
3. Export PDF for one record.
4. Pass: no GRIN-induced loss; PDFs still generate; ITC/GST claims unchanged
   (app does not assert live 2B/EWB).

## C-03 GRIN create → offline restart → reconnect

Requires GRIN visible **and** seeded admission.

1. Airplane mode. Create GRIN (synthetic supplier/lines).
2. Pass: local issued number **null**; command queued.
3. Force-stop; relaunch still offline.
4. Reconnect.
5. Pass: exactly one issued serial; no duplicate number.

If GRIN UI is hidden (store-runtime block, no Packet B patch): record
`blocked_by_runtime` — not a product pass.

## C-04 Evidence upload and confirmation

Execute Team 2 U-01, U-05, U-07 on this binary. Pass criteria there.

Failed confirmation: UI stays pending refresh; originals remain; retry does
not register another receipt.

## C-05 Amend / QC / partial return / rejection / EWB history

1. After issued GRIN, amend a non-original field; QC; partial return;
   record EWB observation (manual, not portal verify).
2. Pass: `original` snapshot unchanged; history appends; expectedVersion
   conflicts surface; pack summary of the earlier cut unchanged.

## C-06 Exported summary and missing evidence

1. Export pack with incomplete originals.
2. Pass: manifest/PDF is a **summary**; `originalsBundled=false`; ITC
   `not_determined`; missing-evidence reasons explicit. Not an archive of
   original files. Not GST/EWB/2B verification. Not ITC eligibility.

## C-07 Account switching and process death

Team 2 U-08 plus force-stop during save/upload. No cross-account publication.

## C-08 Languages

Switch UI through `en`, `hi`, `ta`, `te`, `gu`. Critical GRIN errors use
`grin.*` keys (locale test exists in source; this row is **on-device**).

## C-09 TalkBack

Enable TalkBack. Receiving, inspection, attachments, pack export. Focus order
and spoken labels. No document bodies in logs.

## C-10 Upload limits and daily load

Team 2 U-02, U-03, U-06, U-10. Device RSS/PSS recorded. FileHandle tests are
not this row.

## Scripts that stay pending until a later authorization

`tools/grin-acceptance/device/*.sh` still exit non-zero with `device_pending` /
`play_pending`. Do not edit them to fake a pass.
