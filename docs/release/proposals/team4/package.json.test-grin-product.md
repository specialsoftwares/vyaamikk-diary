# Team 4 proposal: `package.json` script (coordinator-owned)

Do **not** treat this as a silent production change. Coordinator owns `package.json`.

Append the mounted React admission test to `test:grin-product`:

```json
"test:grin-product": "npx --yes tsx src/services/grin/fixture/GrinFixtureRepository.test.ts && npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts && npx --yes tsx src/screens/grin/grinScreens.react.mount.test.ts && npx --yes tsx src/services/grin/pdf/grinPdfAdapter.test.ts && npx --yes tsx src/i18n/grinLocaleKeys.test.ts"
```

Notes:

- `grinScreens.react.mount.test.ts` is mounted React with inert child surfaces plus SQLITE_HOST. It is not NATIVE_DEVICE.
- Runnable without the script: `npx tsx src/screens/grin/grinScreens.react.mount.test.ts`
