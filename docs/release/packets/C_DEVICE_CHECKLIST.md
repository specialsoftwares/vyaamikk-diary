# Packet C — Device checklist (still `device_pending`)

Native-device and Play-installed tests have not occurred. This packet does not
authorize Internal Testing, EAS, Play upload, live backends, billing, or
production admission. Peak-memory / OOM-free behaviour is **not** claimed from
source or emulator results.

Contract revision: `2026-10-02.wave2evidence`. Envelope schema remains
`tools/grin-acceptance/device/expectedEvidence.ts`.

## Required later device surfaces

| Area | What to exercise | Pass later only if |
|---|---|---|
| Picker / PDF / camera | PDF import, supported images, camera capture | Retained file hashed; picker size not trusted; cancel/permission denied safe |
| Offline capture | Airplane mode register + attach | Local issued number null until server; queued originals kept |
| Process death / restart | Force-stop during attach/upload | SQLITE + retained files replay; no second serial |
| Account switching | Queue as A, switch to B, back to A | No cross-account dispatch or display |
| Upload interruption | Kill during reserve/begin/put/verify | Retry verifies stored bytes; no fabricated durable row |
| Receipt mutations | Amend / QC / return / EWB after issue | Confirmed expectedVersion; earlier pinned pack summary unchanged |
| Evidence export | Complete and incomplete packs | Manifest/PDF **summary**; `originalsBundled=false`; ITC `not_determined`; missing-evidence reasons explicit |
| Languages | All shipped locales | `grin.*` keys present; no leftover English-only critical errors |
| TalkBack | Receiving, inspection, attachments, pack export | Focus order and spoken labels; no document bodies in logs |
| Low-memory operation | Boundary and oversize originals | Abort oversize; uncommitted temps deleted; queued originals kept. **Device RSS/PSS still required** — FileHandle tests are not OOM proof |
| Existing diary / auth / save / PDF | Unrelated cash/credit/PDF/auth | No GRIN-induced regression |

## Upload memory (device still open)

Production hashing uses Expo SDK 54 `FileHandle.readBytes` at 64 KiB.
Upload hands an Expo `File` (Blob) to Firebase `uploadBytesResumable`. That is
**not** proof of bounded JS or native peak memory. Enforced ceilings: 15 MiB
PDF / 10 MiB image, 2 concurrent uploads per owner. Measure on device before
any memory acceptance.

## Scripts

Existing `tools/grin-acceptance/device/*` scripts still exit non-zero with
`device_pending` / `play_pending` until a later device authorization.
