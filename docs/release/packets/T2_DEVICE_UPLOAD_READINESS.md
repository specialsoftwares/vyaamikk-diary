# Team 2 — Storage and device-upload readiness

Status: **device gates, not source PASS**. Bounded FileHandle hashing and
independent stored-byte verification stay as implemented at application SHA
`dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` (FileHandle path landed at
`2cbacff`). Do not reopen those source fixes without a new reproduction.

Expo `File` handed to Firebase `uploadBytesResumable` is **not** proof of
native compatibility or bounded peak memory. Record every row below as
`NATIVE_DEVICE` / `PLAY_INSTALLED` until physically executed.

## Preserved source claims (labelled hosts only)

| Claim | Label | Not claimed |
|---|---|---|
| Hashing/copy uses Expo SDK 54 `FileHandle.readBytes` at 64 KiB | SOURCE + SQLITE_HOST + HOST_FILESYSTEM | Device RSS/PSS |
| Avoidable full-file `atob` / `readAsStringAsync` removed from production originals | SOURCE | Native heap during PUT |
| Server hashes stored bytes; client hash is a claim | EMULATOR (isolated Functions+Storage) | Live Storage IAM |
| Ceilings 15 MiB PDF / 10 MiB image / 2 concurrent uploads per owner | SOURCE + SQLITE_HOST | That those ceilings prevent OOM |

## Who executes

This environment has **no attached phone**. Physical execution is the **owner
or a named tester** with USB debugging (memory cases) or Play Internal Testing
install (Play-installed cases).

Identify devices in the run record before starting:

| Slot | Requirement | How to record |
|---|---|---|
| D1 upgrade | The phone that currently has Play Internal Testing **vc22** (`com.specialsoftwares.vyaamikkdiary`) | `adb devices -l`; Settings → About → model; Android API level |
| D2 clean | Second Android 12+ phone, or D1 after uninstall (only after D1 upgrade record is saved) | Same |
| Optional low-RAM | ≤ 4 GiB RAM if available | `adb shell cat /proc/meminfo` MemTotal |

If only one phone exists, run D1 upgrade first, then D2 clean on the same
device after capturing logs.

## How measurements are collected

Do not paste customer PDFs or tokens into tickets. Synthetic files only.

| Signal | Tool | When |
|---|---|---|
| Process RSS / PSS / Java heap / native heap | `adb shell dumpsys meminfo com.specialsoftwares.vyaamikkdiary` | Baseline (GRIN idle), during 15 MiB PDF hash, during resumable PUT, after confirmation | 
| Continuous sample | Android Studio Profiler **or** `adb shell top -p $(pidof …)` every 2s | Whole hash+upload |
| Crash / ANR | Logcat filtered `ActivityManager` / `DEBUG` / app tag; Play Console vitals if Play-installed | After each case |
| File access after restart | App force-stop; reopen; confirm queued original still hashes from retained path | Process-death cases |
| Outcome | GRIN UI state + issued number unchanged + no second serial | Screenshot of **state labels only**, not document bodies |

Peak memory **fail** if: process death attributed to LMK/OOM during a
within-limit file, or PSS during 15 MiB PDF PUT exceeds a pre-agreed budget
the owner sets before the run (recommend starting budget: record the number,
do not invent a pass/fail MB here). Over-limit files must abort **without**
crash.

## Executable cases

Use **synthetic** PDFs/JPEGs generated on the device or from a tester PC.
Never use customer invoices.

### U-01 PDF at limit

1. Create a PDF of **15 MiB ± 50 KiB** (not the picker-reported size).
2. Import via document picker as a goods original.
3. Confirm retained local file size via app/debug (not picker metadata).
4. Complete reserve → PUT → begin → verify → confirmation.
5. Pass: durable original; confirmation cut stored; no crash.
6. Measure meminfo at hash and PUT.

### U-02 PDF over limit

1. PDF **15 MiB + 1 byte** or larger.
2. Pass: abort before durable row; no Storage object linked; no crash.
3. Picker may report a smaller size — still abort on retained bytes.

### U-03 Image at / over 10 MiB

Same as U-01/U-02 for JPEG/PNG camera or gallery. Misleading picker size must
not admit an oversize original.

### U-04 Unknown / spoofed picker size

1. File whose picker `size` is 0, missing, or far below actual bytes.
2. Pass: hasher uses FileHandle size/reads; oversize still rejected; undersize
   real 200 KiB JPEG still accepted.

### U-05 Real picker + camera + restart

1. Camera capture of a receipt-sized JPEG (synthetic paper).
2. PDF from Files app (not a fixture injected into SQLite).
3. Force-stop the app after retention, before or during hash.
4. Relaunch, same account.
5. Pass: retained files still readable; hash resumes; no second GRIN serial.

### U-06 Two concurrent uploads

1. Queue two within-limit originals on one receipt or two receipts.
2. Pass: both complete or one waits; never more than two in-flight PUTs.
3. Third queue stays pending. Measure memory with both in flight.

### U-07 Interrupt and retry

1. Kill app during (a) hash, (b) reserve, (c) PUT, (d) begin, (e) verify, (f)
   confirmation read.
2. Retry without changing the local file.
3. Pass: no second receipt; no second reserved object for a verified original;
   failed confirmation stays `attachment_pending` / `confirmation_refresh`;
   durables remain; retry does not re-PUT a verified original.

### U-08 Account switch during hash / upload / confirmation

1. Start upload as owner A.
2. Switch to owner B (and back) at each phase.
3. Pass: no cross-account dispatch, display, or Storage path for A’s object.

### U-09 Wrong owner / path / generation / hash

Requires a debug/admin hook **or** a seeded Functions environment. On a
Play-installed binary without debug hooks, execute against the **authorized
deployed** callables with a second Auth user.

| Probe | Expected |
|---|---|
| PUT to another uid’s `grinEvidence/…/original` | Storage Rules deny |
| PUT to a non-flight objectKey | deny |
| `grinUploadEvidence` with wrong generation | not durable; no link |
| Claimed hash ≠ stored bytes | not durable; no link |
| Client update/delete of original | deny |

### U-10 Representative daily workload

Repeat for **30 minutes** or **20 originals**, whichever comes first:

- Mix of 1–3 MiB photos and one 8–12 MiB PDF
- Two concurrent where the product allows
- One force-stop mid-PUT
- One confirmation-failure retry (airplane mode during confirmation)

Record: crash count, ANR count, max PSS, whether SQLite/outbox grew without
bound (pending rows should drain). Pass is **no crash** plus drain of
successful items; memory still reported, not assumed.

## Device vs source labels

| Result | Allowed label |
|---|---|
| This packet unexecuted | `device_pending` |
| Executed on USB debug APK | `NATIVE_DEVICE` — **not** Play-installed |
| Executed on Play Internal Testing AAB | `PLAY_INSTALLED` + `NATIVE_DEVICE` |

Do not mark Wave 2 / G6 complete from FileHandle tests or emulator PUT.
