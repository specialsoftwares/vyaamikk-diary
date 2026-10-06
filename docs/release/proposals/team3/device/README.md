# Team 3 device scripts — Internal GRIN (`candidate-1310`)

Prepared **without waiting for an AAB**. No EAS / Play write / prebuild /
OTA. B1 ≠ B2; **neither granted**. Named freeze-prepare `56f2040` **will
retarget**. Retired freeze `520f9f9` — do not build.

**No connected phone = NOT RUN, never PASS.** Host SQLite / mounted inert
React / emulator / CI greens are **not** device evidence.

`adb devices -l` at packet time: empty.

## How to invoke (owner / tester later)

From the worktree:

```bash
bash docs/release/proposals/team3/device/print-matrix.sh
bash docs/release/proposals/team3/device/d1-upgrade-oneplus-12r.sh
bash docs/release/proposals/team3/device/d2-clean-install-placeholder.sh
bash docs/release/proposals/team3/device/startup-otp-onboarding-reviewer.sh
bash docs/release/proposals/team3/device/diary-save-pdf.sh
bash docs/release/proposals/team3/device/grin-offline-sync-amend-export.sh
bash docs/release/proposals/team3/device/interrupt-death-account-switch.sh
bash docs/release/proposals/team3/device/languages-a11y-low-memory.sh
```

Each script:

1. Refuses `eas` / `play` / `deploy` / `ota` / `prebuild` arguments.
2. Counts `adb` devices in `device` state.
3. Prints the intended physical steps.
4. Exits **2** with `STATUS=NOT_RUN` and `PASS=false` unless a later owner
   fill of `RESULT_CAPTURE.template.md` records the run. Scripts **never**
   print `STATUS=PASS`.

Do not write Firebase UIDs, OTPs, passwords, or recovery codes into git.
Hash uids in shared logs.

## Row map

| Script | Sheet IDs |
|---|---|
| `d1-upgrade-oneplus-12r.sh` | D1 (OnePlus 12R, Android 16, vc22 yes, today) |
| `d2-clean-install-placeholder.sh` | D2 (device still unnamed) |
| `startup-otp-onboarding-reviewer.sh` | D3, D4, D5, D6 |
| `diary-save-pdf.sh` | D7, D8, D9 |
| `grin-offline-sync-amend-export.sh` | G1–G7, P1–P3 (G1/G3/G7 need later backend) |
| `interrupt-death-account-switch.sh` | I1, I2, I3 |
| `languages-a11y-low-memory.sh` | L1–L3, A11, M1, W1 |
| `print-matrix.sh` | all of the above + reminder XR N/A |

Form: `../OWNER_DEVICE_FORM.md`. Sheet: `../../../packets/DEVICE_EXECUTION_SHEET.md`.
