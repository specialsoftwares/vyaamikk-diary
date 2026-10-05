# Device execution sheet — Internal GRIN candidate

Who: owner or named tester on hardware. Coordinator/AI does **not** physically
execute. Tick only after the named run. Synthetic data only while retention
is unset.

All rows **NOT RUN**. Host / emulator / SQLITE_HOST results are not device
passes.

Contract: `2026-10-02.wave2evidence`.
Intended binary (after Approval B): Play Internal AAB `internal-grin` at
application `5d5df3d…` (or later approved SHA) **or** labelled sideload APK.
Label the artifact: `PLAY_INSTALLED` vs `NATIVE_DEVICE`.

Pre-record: device ID, Android version, RAM, versionCode, AAB/APK sha256,
auth method, backend (`LIVE_BACKEND` seeded vs `backend_absent`).

Upgrade device = current Internal **vc22**. Clean device = D2.

---

| ID | Steps | Expected | Label | Status |
|---|---|---|---|---|
| D0 | Record identities; confirm artifact class | Identities written; no guessed vc22 reconstruction from a commit label | — | NOT RUN |
| D1 | Upgrade install over vc22 via Play | Play shows new versionCode; cold start; existing diary/PO/credit/letterhead/PDF still work; SQLite v10 migrates | PLAY_INSTALLED | NOT RUN |
| D2 | Clean install | Same launch/sign-in; empty local DB | PLAY_INSTALLED or NATIVE_DEVICE | NOT RUN |
| D3 | Force-stop; reboot; open app | Splash completes; main tabs; legal date `2026-07-27`; no token printed | same | NOT RUN |
| D4 | Sign-in phone OTP | Session bound to that uid | same | NOT RUN |
| D5 | Reviewer login `+91 9000000000` / `654321` **only if** live test-phone fixture verified | Reaches tabs; **no founder email** | same | NOT RUN |
| D6 | Email / profile onboarding if shown | Completes; consents recorded | same | NOT RUN |
| D7 | Ordinary diary create/edit/save | Persists; no GRIN-induced loss | same | NOT RUN |
| D8 | PDF export of a diary record | PDF generates; ITC/GST claims unchanged (app does not assert live 2B/EWB) | same | NOT RUN |
| D9 | Saved Records hub | Ordinary records listed; GRIN tile only if Internal-GRIN flags baked | same | NOT RUN |
| G1 | GRIN create online (seeded admission) | One serial; no duplicate | PLAY_INSTALLED + LIVE_BACKEND | NOT RUN |
| G2 | Airplane mode create; force-stop; relaunch offline; reconnect | Local serial null while queued; exactly one issued serial after reconnect | same | NOT RUN |
| G3 | Reserve → upload evidence → confirmation | Stored-byte verify; failed read stays pending/confirmation_refresh; no second serial | same | NOT RUN |
| G4 | QC, amend non-original field, partial return, EWB observation (manual) | `original` snapshot unchanged; history appends; expectedVersion conflicts surface | same | NOT RUN |
| G5 | Pack / export | Summary; `originalsBundled=false`; ITC `not_determined`; missing originals explicit | same | NOT RUN |
| G6 | If GRIN UI hidden or `backend_absent` | Record `blocked_by_runtime` or `backend_absent` — **not** a product pass | same | NOT RUN |
| I1 | Interrupt upload; retry | Original intact; no duplicate evidence id | same | NOT RUN |
| I2 | Process death during save/upload; restart | No duplicate issuance; pending work recoverable or honestly failed | same | NOT RUN |
| I3 | Account switch / logout during pending work | No cross-account publication | same | NOT RUN |
| P1 | Picker / camera permission grant | File attached | same | NOT RUN |
| P2 | Permission deny / picker cancel | Honest cancel; no crash; no zero-byte original claimed verified | same | NOT RUN |
| P3 | Maximum admitted files on one receipt | Policy deny or cap message; already-linked kept | same | NOT RUN |
| W1 | Repeated daily-use (multiple receipts + uploads) | No sustained unusable jank; record duration | same | NOT RUN |
| M1 | Measured RSS/PSS on representative phones during G3 | Numbers recorded; OOM-free **not** claimed from source | same | NOT RUN |
| L1 | Five languages | UI strings readable; no clipped critical actions | same | NOT RUN |
| L2 | Large text / font scale | Primary actions reachable | same | NOT RUN |
| L3 | Keyboard | Fields not permanently covered; save reachable | same | NOT RUN |
| A11 | TalkBack | Sign-in, save, GRIN primary actions announced | same | NOT RUN |
| C1 | Crash reporting consent disabled | No upload of crashes beyond documented fail-closed | same | NOT RUN |
| C2 | Consent enabled | Crashlytics receives a test non-fatal **only if** owner allows | same | NOT RUN |

If no device is accessible, this sheet stays **NOT RUN** and is the owner
handoff. Do not convert CI greens into D1–C2 passes.
