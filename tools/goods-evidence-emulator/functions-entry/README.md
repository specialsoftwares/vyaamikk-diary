# Isolated GRIN Functions emulator (Team 1)

Not live deploy. Not `functions/src/index.ts`. Do not deploy.

This folder is the E1 isolated Functions-emulator entrypoint. It re-exports
`createProductionGrinCallables` from `functions/src/goodsEvidence/productionCompose.ts`
(Admin Firestore + Storage bound to packaged G1/G2 adapters). Production
`functions/src/index.ts` stays on HOLD (no GRIN export). Do not treat the
fail-closed `handleGrin*` stubs as this composition.

## Ports (do not share the G1 8088 or G2 8091/9200 processes)

| Service | Host | Port |
|---|---|---|
| Functions | 127.0.0.1 | 5002 |
| Firestore | 127.0.0.1 | 8090 |
| Storage | 127.0.0.1 | 9201 |
| Auth | 127.0.0.1 | 9100 |
| Project | `demo-vyaamikk-grin-t1` | |

## Injected boundaries (documented; not a skip)

- Emulator hosts above (`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`). Unset hosts fail the round-trip test; they are not counted as pass.
- `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` on the **emulator process only**.
- Explicit emulator Admin target: `GRIN_ADMIN_PROJECT=demo-vyaamikk-grin-t1` and
  `GRIN_ADMIN_STORAGE_BUCKET=demo-vyaamikk-grin-t1.appspot.com`. Missing those
  values must not select a production project, and production must not fall
  back to this demo pair.
- Auth test user via Auth emulator custom token for the seeded uid.
- Admin SDK seed of user / ledger / admission (test setup, not the mobile client).
- Isolated Rules copies in this folder (not live `firestore.rules` / `storage.rules`).
- Round-trip test may inject Node `readFile` for `localPath` (production transport uses fetch / Expo FileSystem). `httpsCallable` is the real Firebase JS SDK against this emulator.

## Run the round-trip test

```bash
npm run test:goods-evidence-g1-functions-emulator
```
