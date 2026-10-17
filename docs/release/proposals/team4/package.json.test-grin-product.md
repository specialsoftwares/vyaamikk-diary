# Team 4 proposal: `package.json` script (coordinator-owned)

Do **not** treat this as a silent production change. Coordinator owns `package.json`.

Append the mounted React admission test, the actual-screen origin-bind test, and the default server-port factory unit test to `test:grin-product`:

```json
"test:grin-product": "npx --yes tsx src/services/grin/fixture/GrinFixtureRepository.test.ts && npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts && npx --yes tsx src/services/grin/repository/appBinding.defaultServerPort.unit.test.ts && npx --yes tsx src/screens/grin/grinScreens.react.mount.test.ts && npx --yes tsx src/screens/grin/grinScreens.origin.bind.test.ts && npx --yes tsx src/screens/grin/grinOriginalPicker.sqliteHost.test.ts && npx --yes tsx src/services/grin/pdf/grinPdfAdapter.test.ts && npx --yes tsx src/i18n/grinLocaleKeys.test.ts"
```

Notes:

- `grinScreens.react.mount.test.ts` is mounted React with inert child surfaces plus SQLITE_HOST. It is not NATIVE_DEVICE. It injects `createUninjectedGrinServerPort` so it does not call Firebase.
- `grinScreens.origin.bind.test.ts` mounts production admitted bodies (Amend / QC / Return / Create / EWB / Attachments / Pack) with inert native surfaces. SQLITE_HOST. Injected FAKE ports. Captured A's actions after live switch to B must not call B. Pack export does not claim OS share cancellation. Not NATIVE_DEVICE.
- `grinOriginalPicker.sqliteHost.test.ts` is SQLITE_HOST / host filesystem. Injected OS picker + host copy/hash. PDF import, image import, camera injected bytes, cancel, denied permission, missing/inaccurate size, oversize, source disappearance, sqlite reopen, account switch during await. NATIVE_DEVICE not claimed.
- `GrinApplicationRepository.test.ts` is SQLITE_HOST. Binding tests inject FAKE ports (`createUninjectedGrinServerPort` / `createFakeGrinServerPort` / `createUninjectedGrinEvidencePort`). F2 fail-closed when `getConfirmedProjection` is missing. F3/E5 `exportPack` uses `assembleEvidencePackInputs` with explicit A/B/C/D pack cases. `toPackOriginalInput` uses retained actual hash/mime/generation.
- `appBinding.defaultServerPort.unit.test.ts` is a source-graph unit test: production default references `createFirebaseJsGrinTransport` / `createFirebaseJsGrinEvidenceTransport` / `httpsCallable` and is not the uninjected FAKE always-deny port. It does not start a session and does not claim NATIVE_DEVICE.
- Runnable without the script:
  - `npx tsx src/screens/grin/grinScreens.react.mount.test.ts`
  - `npx tsx src/screens/grin/grinScreens.origin.bind.test.ts`
  - `npx tsx src/services/grin/repository/appBinding.defaultServerPort.unit.test.ts`
