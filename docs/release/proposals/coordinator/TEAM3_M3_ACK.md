# Coordinator acknowledgement — Team 3 M3/L4

Reviewed `7ff2f36` on `team/grin-t3-offline` (diff, not the agent report). Merged to combined `4cd2647`.

- Skip-before-lease for types `canDispatchCommandType` rejects; stuck `dispatching` rows return to `queued` with lease cleared
- `reconcile` typed as `GrinReconcileResult`; register dispatch refuses to mint `issuedNumber` from a mutation success
- Catch still only reconciles on `isNetworkAmbiguous`

Coordinator re-ran `test:grin-outbox` on combined. **SQLITE_HOST**. Not NATIVE_DEVICE. Not Team 5 re-review. G6 not complete.
