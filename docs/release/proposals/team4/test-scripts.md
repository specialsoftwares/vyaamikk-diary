# Team 4 proposal — test scripts

`package.json` is coordinator-owned. Wave 1 `test:grin-product` already includes fixture/PDF/locale tests. Wave 2 adds:

```
npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts
npx --yes tsx src/services/grin/repository/appBinding.defaultServerPort.unit.test.ts
npx --yes tsx src/screens/grin/grinScreens.react.mount.test.ts
npx --yes tsx src/screens/grin/grinScreens.origin.bind.test.ts
npx --yes tsx src/screens/grin/grinOriginalPicker.sqliteHost.test.ts
```

The repository, picker, and mount suites use HostSqlite (`SQLITE_HOST`, not `NATIVE_DEVICE`) and inject FAKE server/evidence ports so they do not call Firebase. Picker tests inject a host filesystem; they are not NATIVE_DEVICE. The default-port unit test is a source-graph check (`createFirebaseJsGrinTransport` / `createFirebaseJsGrinEvidenceTransport` / `httpsCallable`); it is not NATIVE_DEVICE.

Team 4 does not bump versionCode, enable billing, or add deploy jobs.
