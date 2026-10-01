# Team 4 proposal — test scripts

`package.json` is coordinator-owned. Please add these Wave 1 verify commands to `test:goods-evidence` (or a new `test:grin-product` suite included in `test:all`):

```
npx --yes tsx src/services/grin/fixture/GrinFixtureRepository.test.ts
npx --yes tsx src/services/grin/pdf/grinPdfAdapter.test.ts
npx --yes tsx src/i18n/grinLocaleKeys.test.ts
```

`src/goodsEvidence/exceptions.test.ts` is already invoked by `test:goods-evidence`.

Team 4 does not bump versionCode, enable billing, or add deploy jobs.
