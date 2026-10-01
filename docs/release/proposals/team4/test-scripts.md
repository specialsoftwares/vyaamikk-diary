# Team 4 proposal — test scripts

`package.json` is coordinator-owned. Wave 1 `test:grin-product` already includes fixture/PDF/locale tests. Wave 2 adds:

```
npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts
```

That suite uses HostSqlite (`SQLITE_HOST`, not `NATIVE_DEVICE`) and does not import firebase-admin into `src/screens`.

Team 4 does not bump versionCode, enable billing, or add deploy jobs.
