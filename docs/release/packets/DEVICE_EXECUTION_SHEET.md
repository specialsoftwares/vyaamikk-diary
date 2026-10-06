# Device execution sheet — Internal GRIN candidate

Who: owner plus two named testers on hardware. Coordinator/AI does **not**
physically execute. Tick only after the named run. Synthetic data only while
retention is unset.

All rows **NOT RUN**. Host / emulator / SQLITE_HOST results are not device
passes. This session (`adb devices -l`): **no attached device**. Do not
convert host/emulator/CI greens into PASS.

Contract: `2026-10-02.wave2evidence`.
Intended binary (after Approval B): Play Internal AAB `internal-grin` at
the **post-S1/S2 freeze SHA** (placeholder; **not** `b845e8a` / `41b05a4`)
**or** labelled sideload APK. Current checkpoint application `b845e8a` /
PR head `41b05a4` / GHA `37379529193` is **pre-S1/S2**. Label the artifact:
`PLAY_INSTALLED` vs `NATIVE_DEVICE`.

Sideload APK and Play Internal AAB remain distinct. Historical EAS AAB
`72cb7254-0be9-4f92-a514-dbfab2b1150d` (vc22, profile `production`, git
`0da2f58970f2`) is **not** this SHA and is **not** an Internal-GRIN candidate.

Pre-record: device ID, Android version, RAM, versionCode, AAB/APK sha256,
auth method, backend (`LIVE_BACKEND` seeded vs `backend_absent`).

Upgrade device = current Internal **vc22** (Play Console 2026-10-06:
Internal **Active**, latest **Vyaamikk Diary (Vc22)**; re-read before B1).
Clean device = D2.

`versionCode` 23 is **UNRESERVED** (Play explorer 2026-10-06: 23 absent;
still not reserved). Never assume it remains available.

---

## Testers (owner input still required)

Arrangement accepted: **owner + two testers**. Identities, UIDs, emails, and
passwords are **blank until the owner fills them**. Do not invent.

| Slot | Role | Display name | Firebase uid | Play Internal email | Phone | Auth notes |
|---|---|---|---|---|---|---|
| O | Owner | | | | | Owner fills. No password in this sheet. |
| T1 | Tester 1 | | | | | Owner fills. |
| T2 | Tester 2 | | | | | Owner fills. |

Admission docs (`users/{uid}/goodsEvidenceAdmission/runtime`) are Approval A,
not this sheet. Play licence-tester emails are **not** Firestore admission.

Required hardware: D1 (Play Internal vc22 upgrade) + D2 (clean Android 12+)
+ TalkBack-capable device (may be D1/D2). Identities and device IDs are
**gaps** until the owner fills them. Evidence for each row:
`docs/release/proposals/team3/DEVICE_HANDOFF.md` (no hardware = NOT RUN).

---

| ID | Steps | Expected | Label | Status |
|---|---|---|---|---|
| D0 | Record identities; confirm artifact class | Identities written by owner; no guessed vc22 reconstruction from a commit label | — | NOT RUN |
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
| G5 | Pack / export | Summary; `originalsBundled=false`; ITC `not_determined`; missing originals explicit. **Not** an archive of original files | same | NOT RUN |
| G6 | If GRIN UI hidden or `backend_absent` | Record `blocked_by_runtime` or `backend_absent` — **not** a product pass | same | NOT RUN |
| G7 | Original download / export of a verified original (**not** pack-as-archive) | Original PDF/image leaves the device as the retained file (share/save/open), distinct from G5 pack summary. If the binary has no original-download control, record `missing_control` — not a pack pass | same | NOT RUN |
| I1 | Interrupt upload; retry | Original intact; no duplicate evidence id | same | NOT RUN |
| I2 | Process death during save/upload; restart | No duplicate issuance; pending work recoverable or honestly failed | same | NOT RUN |
| I3 | Account switch / logout during pending work | No cross-account publication | same | NOT RUN |
| P1 | Picker / camera permission grant | File attached | same | NOT RUN |
| P2 | Permission deny / picker cancel | Honest cancel; no crash; no zero-byte original claimed verified | same | NOT RUN |
| P3 | Maximum admitted files on one receipt | Policy deny or cap message; already-linked kept | same | NOT RUN |
| Q80 | Drive ordinary monthly usage to ≥80% of the capped allowance | `quotaWarn80` (or equivalent) visible on You / Subscription management. Quota-upsell sheet must **not** appear on Internal-GRIN (`EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"`) | same | NOT RUN |
| Q95 | Drive ordinary monthly usage to ≥95% of the capped allowance | Dedicated 95% copy **if present on the binary**; otherwise record the actual string shown (source today has `warnAt80` for ≥80% and **no** `quotaWarn95` key). Still not a host pass | same | NOT RUN |
| QCAP | Hit the ordinary monthly cap | Cap messaging (`sync.quotaReachedBanner` / `savedLocallyQuota` / `entryQuota` or equivalent). New ordinary save stays on device or is honestly refused; no silent truncate. Upsell remains off on this profile | same | NOT RUN |
| XR | Expiry-read window for a stored GRIN original | **N/A until backend** (live original-read / signed-read TTL not a device gate yet). Do not mark PASS. Re-open this row only after Approval A original-read exists | PLAY_INSTALLED + LIVE_BACKEND | N/A (backend) |
| W1 | Repeated daily-use (multiple receipts + uploads) | No sustained unusable jank; record duration | same | NOT RUN |
| M1 | Measured RSS/PSS on representative phones during G3 | Numbers recorded; OOM-free **not** claimed from source | same | NOT RUN |
| L1 | Five languages (`en`, `hi`, `ta`, `te`, `gu`) | UI strings readable; no clipped critical actions; switch through all five | same | NOT RUN |
| L2 | Large text / font scale | Primary actions reachable | same | NOT RUN |
| L3 | Keyboard | Fields not permanently covered; save reachable | same | NOT RUN |
| A11 | TalkBack | Sign-in, save, GRIN primary actions announced | same | NOT RUN |
| C1 | Crash reporting consent disabled | No upload of crashes beyond documented fail-closed | same | NOT RUN |
| C2 | Consent enabled | Crashlytics receives a test non-fatal **only if** owner allows | same | NOT RUN |

If no device is accessible, this sheet stays **NOT RUN** (XR remains
**N/A until backend**) and is the owner handoff. Do not convert CI greens
into D1–C2 passes.
