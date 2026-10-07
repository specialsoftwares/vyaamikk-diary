# Coordinator acknowledgement — Team 2 Wave 1

Reviewed commit `8989b48` on `team/grin-t2-evidence` and merged into `integration/grin-g1-g5-source`.
This is an extra AI review layer, not human certification. Not G6. Not live Storage.

## Accepted as Wave 1 evidence source (undeployed)

- `src/goodsEvidence/evidence.ts` lifecycle, bounds, `VerifiedEvidenceResult` builder
- `tools/goods-evidence-storage/**` emulator/FAKE ports (Firestore **8091**, Storage **9200**)
- Isolated emulator rules; live `storage.rules` unchanged (no `grinEvidence`)
- Proposal only: `docs/release/proposals/team2/storage.rules.grin.md`
- Root `tsconfig.json` already excludes `tools/goods-evidence-storage`

## Coordinator-owned wiring applied on combined

- `typecheck:goods-evidence-g2`, `test:goods-evidence-g2-unit`, `test:goods-evidence-g2-emulator`
- `ci:verify` and `lint` include g2 typecheck; g2 emulator is a separate `ci:verify` stage
- `test:all` excludes `test:goods-evidence-g2-emulator` (emulator suite)

## Not accepted as production GRIN

- Live bucket IAM, retention locks, legal holds, lifecycle rules
- Absolute immutability against administrators
- Encrypted-backup (backlog)
- Cross-user existence-safe production IAM (emulator cannot prove it)
