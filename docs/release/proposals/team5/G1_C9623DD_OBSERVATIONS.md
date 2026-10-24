# G1 parent `c9623dd` — observations against the four accepted corrections

**Not an approval.** Team 1 still owns undefined-object normalize, durable mutations, and Functions packaging. Team 5 does not accept G1.

Parent: `c9623ddb282ea3b1365f2bead9088b10a972a770` (`fix(grin): fail closed on corrupt serials, unsafe line ids, and pre-commit logs`).

The four accepted corrections, read from that commit subject plus G1 `ARCHITECTURE.md` / implementation register:

1. Fail closed on corrupt serial counters (`integrity`, no coercion/repair; `serial_exhausted` at 999999).
2. Unsafe line identities rejected (`__proto__` / `constructor` / `prototype`); ordinary ids including `toString` persist as own keys.
3. Commit logging only after successful `runTransaction` (`grin_g1_committed` never on abort/replay).
4. Retry classification by Firestore/gRPC ABORTED codes only (not error message text).

The same commit also added bounded unknown input (`limits.ts`) and `typecheck:goods-evidence-g1`. Those are supporting work, not extra Team 5 approvals.

## Observations (not acceptance)

- `tools/goods-evidence-emulator/serial.ts` plus `corrections.emulator.test.ts` exercise string/missing/fractional/wrong-FY counters and exhaustion.
- `ids.ts` `lineIdError` plus adapter projection `Object.prototype.hasOwnProperty` after a null-prototype map.
- `adapter.ts` `runAttempts` logs `grin_g1_committed` only when `outcome.ok && outcome.replayed === false` after the transaction returns.
- `retry.ts` treats `10` / `"ABORTED"` / `"aborted"` as retryable; `retry.test.ts` rejects message-only `ABORTED:` strings.

## Explicitly not closed at this parent

- Undefined-object adapter normalize-before-digest (contract text still assigned to Team 1 Wave 1). `cloneSnapshot` is `structuredClone`.
- Durable mutation adapter and Functions packaging (`functions/src/goodsEvidence/**` absent; `functions/src/index.ts` has no GRIN export).
- Native offline, Storage, legal evidentiary sufficiency, production load, live commit timestamps.

Matrix rows that mention these G1 files are `path_present_unapproved` or `tbd`.
