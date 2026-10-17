# Coordinator acknowledgement — Team 1 M1/M2

Reviewed `00273f1` on `team/grin-t1-backend` (diff, not the agent report). Merged to combined `3088026`.

- After gate, missing/unreadable mutation receipts are `not_found`; foreign original stays `forbidden`
- Identity/admission run inside the transaction before `prepareRegister` / `prepareMutation` / `prepareReconcile`
- Caller input still copied; Functions remain unexported

Coordinator re-ran `typecheck:goods-evidence-g1`, `test:goods-evidence-g1-unit`, and `test:goods-evidence-g1-emulator` (8088). Not Team 5 re-review. G6 not complete.
