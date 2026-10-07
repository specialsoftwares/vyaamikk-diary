# Coordinator acknowledgement — Team 1 Wave 1

Reviewed commit `5c7543d` on `team/grin-t1-backend` and merged into `integration/grin-g1-g5-source`.
This is an extra AI review layer, not human certification. Not G6. Not live Functions.

## Accepted as Wave 1 backend source (undeployed)

- Undefined-object normalize: omitted optional properties and `undefined` properties share digest representation; sparse/undefined array entries still rejected
- Durable mutation adapters: amend, QC, return, void, EWB observation, `linkVerifiedEvidence`
- Four prior G1 corrections preserved (serial fail-closed, line identities, bounded input, commit-after-success + ABORTED retries)
- Fail-closed `functions/src/goodsEvidence/callables.ts` **not** exported from `functions/src/index.ts`
- Isolated G1 emulator still on Firestore port **8088**

## Coordinator-owned wiring applied on combined

- `tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts` `DOMAIN_FILES` now includes `evidence.ts` (wave1b `ports.ts` type-import)
- `tools/goods-evidence-emulator/tsconfig.json` include adds `evidence.ts`
- `package.json`: mutation unit/emulator tests, `package:goods-evidence-functions`, `typecheck:goods-evidence-g2` stays coordinator-owned

## Not accepted as production GRIN

- Live Admin SDK / deployed callables
- GRIN retention after `pending_deletion` / `retireIdentity` (unresolved policy)
- Production IAM, indexes, or Functions env `GRIN_GOODS_EVIDENCE_FUNCTIONS=true`
