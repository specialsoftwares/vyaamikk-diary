# Team 4 proposal — test scripts

`package.json` is coordinator-owned. Wave 1 `test:grin-product` already includes fixture/PDF/locale tests. Wave 2 adds:

```
npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts
npx --yes tsx src/services/grin/repository/appBinding.defaultServerPort.unit.test.ts
npx --yes tsx src/screens/grin/grinScreens.react.mount.test.ts
npx --yes tsx src/screens/grin/grinScreens.origin.bind.test.ts
```

The repository and mount suites use HostSqlite (`SQLITE_HOST`, not `NATIVE_DEVICE`) and inject FAKE server ports so they do not call Firebase. The default-port unit test is a source-graph check (`createFirebaseJsGrinTransport` / `httpsCallable`); it is not NATIVE_DEVICE.

Team 4 does not bump versionCode, enable billing, or add deploy jobs.
