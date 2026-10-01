# Android source candidate manifest

This is a **new committed source baseline** for review. It is **not** reconstructed vc22.
Exact source-to-installed-vc22 correspondence: **UNVERIFIED**.

## Coordinates

| Role | SHA |
|---|---|
| Security / assembly base | `90c6948498f8b49a0d625a8068e1906e452ca6f6` |
| Security chain | `0da2f58` → `eb5f582` → `90c6948` |
| `origin/main` at assembly | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` (unchanged vs security base) |
| Historical workspace checkpoint | `draft/goods-evidence-domain-contract` at `55f2df1405c296336eea058238c8ae24e7a8b370` plus uncommitted boot/branding/Play-review files |
| Candidate branch | `release/android-source-candidate` |

Imported deltas were taken from the historical **uncommitted** tree against that workspace’s own committed blobs. Those committed blobs matched `90c6948` for every included tracked file except `package.json` (security branch already added `test:safe-diagnostics`).

## App / package / version (source review only)

- `version`: `1.0.0`
- `android.versionCode`: **22** — admitted because the imported `app.json` still declares it. **Not approved for another Play upload.** A later build must use a freshly verified unused Play versionCode.
- Package: `com.specialsoftwares.vyaamikkdiary`
- `eas.json` **unchanged** from `90c6948`
- Production/preview source still has `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED=1` and `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=1`
- Legal effective date remains `2026-07-27` (`src/config/legal.ts`); `2026-09-22` was not reintroduced

## Included files (SHA-256 of candidate bytes)

### Tracked historical uncommitted deltas (applied onto `90c6948`)

| Path | Origin | SHA-256 |
|---|---|---|
| `app.json` | historical uncommitted `app.json` vs committed `880d1b5` (identical on `90c6948` / `55f2df1`) | `350049ee5fa79e871931dee76fc071cfd0045b3cc417853cb8cef7c1397cd431` |
| `app/index.tsx` | historical uncommitted boot wiring vs committed `3d82f82` | `bea21d4a6447de273f61d7c3398e13b431f03d8fef01a595f7fc0a51540500fd` |
| `assets/android-icon-background.png` | historical uncommitted launcher asset | `84bfa2610e36920795a494b41858b6907f5e513f5991d9717da86566b92b01f9` |
| `assets/android-icon-foreground.png` | historical uncommitted launcher asset | `c1c24541933ef661146be580c2fe720331b599ef0b19c89206b3ae6dc0aff02f` |
| `assets/android-icon-monochrome.png` | historical uncommitted launcher asset | `ee8727ad082e45f1c573d04f1eca3062b5998da9ec87f8bc6ef553d23046215d` |
| `assets/icon.png` | historical uncommitted launcher asset | `65870c4e306031dadcf2cfdf2d59e5a02af37f31448b2c698a1f0ff4cc9a3130` |
| `src/boot/bootProductionStartup.contract.test.ts` | historical uncommitted contract update | `d792eb09d7bce4c064c5a5d5a2bc341f308e95fbc756fc364752c42d974d668c` |
| `package.json` | `90c6948` file plus one review script and its offline contract test; lockfile unchanged | `f686ca188b516af99422dc33c22ef69a82fb4dffdc55dd59c6e24604772813fd` |

### Untracked historical files copied or derived

| Path | Origin | SHA-256 |
|---|---|---|
| `plugins/withAndroidLocaleConfigs.js` | historical untracked plugin (byte copy) | `1b133c051f7c3551a50b0747f89d5df04473858aa849bcb5dea6d48b84d1457b` |
| `store/play-feature-graphic.png` | historical untracked listing artwork | `b17f8082b5b7f025ce0ecfc23d0dd096c8997a945f5960198e135b27d10dddd1` |
| `store/play-icon-512.png` | historical untracked listing artwork | `cc550cb8450c62d5b991da56d0e5989db9ee14fb7d971b679848728caf401f5a` |
| `store/play-icon-512-masked-preview.png` | historical listing preview (not a launcher asset) | `a0c18f35fde4a2585fb0a6d6131441552c7a784992bebee7ae248b081fd51a30` |
| `scripts/setup-play-review-account.ts` | derived from historical untracked script; success text limited to fields actually checked | `8cff4cb344a8957aa362ea87d2e85cde8ca06ddf57b1caa6187750059f243c00` |
| `docs/PLAY_REVIEW_SETUP.md` | derived from historical untracked doc; removed reviewer-inbox creation and email OTP instructions | `9f86bb4e89f533664d151b3eaf961e6789cdacae42ce9c6d0e30c07f7d2b24aa` |
| `scripts/setup-play-review-account.contract.test.ts` | new offline contract for the admitted review files | `78794305dfbcba79e183191a69be1e4d6d56205aec13469530e345bd60c67c01` |

## Excluded

- Entire GRIN / goods-evidence tree (`src/goodsEvidence`, `test:goods-evidence`, `analysis/grin-slice2-closeout/**`)
- Historical `CURSOR_PROGRESS.md`
- Historical `.github/pull_request_template.md` and `CONTRIBUTING.md` (process docs, not this Android source allowlist)
- Private/local configuration: `.env`, `google-services.json`, `GoogleService-Info.plist`, keystores, service-account JSON
- Generated AAB/APK artifacts and `node_modules`
- `eas.json`, purchase-entry flags, auth, Rules, IAP internals, save locks, PDF services, navigation destinations

## Unresolved / needs later owner action

- Installed vc22 correspondence remains unverified
- Live Play review account is **not** created or verified here; `review:verify-account` is live-only and not run in this assignment
- App onboarding may still require identity steps beyond the five Firestore fields the script checks
- Production/preview still enable purchase-entry UI in `eas.json`; server fail-closed billing is unchanged. Diagnostics do **not** resolve “purchase UI visible while billing unavailable”
- versionCode 22 is source-admitted only; Play inventory was not consulted
- Native/EAS build, OTA, deploy, Play upload: **not authorized**

## Validation boundaries

- Isolated worktree locked dependencies
- Focused: diagnostics, boot contract, Expo public config, review-account offline contract, typecheck, lint of changed extra-glob TypeScript paths
- `plugins/withAndroidLocaleConfigs.js` is inspected source; the existing Expo ESLint config cannot load `@typescript-eslint` for a JS-only file without changing `eslint.config.js`, which this assignment does not do
- Canonical: `npm run ci:verify` on this candidate (not a rerun of PR #28)
- Injected diagnostics tests do not prove native Crashlytics consent
- Boot contract tests do not prove mounted device animation
- `npx expo config --type public` is a non-build config gate, not a native prebuild
