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
| Starting reviewed head (assembly) | `0a89fff5e9a1f485209746de6966edcd643a5a85` |
| Previous correction head | `848eb9f58e9817fa56ce40b6998d3851d82cd004` |
| Boot/locale closeout head | `a4dcfa40cbfdb4915f716813a0ae2b463613f082` |

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

Historical hashes above are the **assembly** bytes at `0a89fff`. They are not the bytes of the pre-build corrections below.

## Pre-build corrections (reviewed after `0a89fff`)

These replace the corresponding assembly bytes. They are not historical imports.

| Path | Correction | SHA-256 |
|---|---|---|
| `app/index.tsx` | Boot completion uses session UID+generation; timeouts do not invent destinations | `032e13627dc49309d48a508a71511eb35842a223fff8b3e6cca6ad423ff6b9f3` |
| `src/boot/bootCompletion.ts` | EXTRACTED_RUNTIME ownership machine (new) | `d59f30dc39c6171a1c216532ae30e1f58d560fc6c7f3ec6772cc2ea8e15d8000` |
| `src/boot/bootCompletion.test.ts` | EXTRACTED_RUNTIME deferred-barrier / fake-clock tests (new) | `d9de8968849833dcecc04735a6b7466dd2a2246f78c95a7732946dc2b1fc90b0` |
| `src/boot/BootAnimationGate.tsx` | Hold timeout remains presentation-only; bootError no longer forces navigation | `37934863d1024e2d63b2fe1fbb3b0e24fdd72fa131c28fbab0ffa4c268d45e1d` |
| `src/boot/bootProductionStartup.contract.test.ts` | Contract updated for ownership wiring | `7a77464755edf3dcb5850bce6110dbc35005265866184265a8c4d0a3e9996f02` |
| `src/boot/bootReleaseGate.contract.test.ts` | Assert bootError does not force onHoldTimeout | `a8e0f98dfa50744f637fe185a3832dcdc9cd939dd3706e3c4cd86d4d8b04b5cf` |
| `scripts/setup-play-review-account.ts` | Read-only verifier bound to expected project/phone; no profile-value printing | `3d22701b77e1f8b2f0229e0a59132665779a6dbda5d2dff9422bc0631bbe0380` |
| `scripts/setup-play-review-account.contract.test.ts` | Injected-Admin offline tests | `5e250a8c93b31862aea89fd9ee02dd12c5af5db4abc4f09535696699a84665c3` |
| `docs/PLAY_REVIEW_SETUP.md` | Test-phone fixture wording; no session-termination claim | `c102fc26a5833eafed7f4d9e29cfb925e50d96a064088ee425a15ce703d03737` |
| `plugins/withAndroidLocaleConfigs.js` | Distinguish comments from `resConfigs`; require en/hi/ta/te/gu | `de3e32ab9caa45b25b733b8b25ea60cf0bff00bb3c31a159ad95cdf27b93d3be` |
| `plugins/withAndroidLocaleConfigs.test.ts` | Gradle fixture tests (new). Not device shrinking evidence | `765638859268a456c54b29e14d03e1b9dad41a259e571bd0e0e2e95186fbec6d` |
| `package.json` | Adds `test:boot-completion` and `test:android-locale-configs`; lockfile unchanged | `22f19764751f39fde2a58b3e3b33caa423b255cac7d0a8542183097bba785fa1` |

Review-account verifier bytes at `848eb9f` are **preserved and closed** (not modified in the boot/locale closeout).

## Boot/locale closeout (after `848eb9f`)

Continuation tickets bind Continue/Later/View Drafts to originating UID+generation+attempt. Dispatch consults live `syncSessionOwnership`. Locale replacement edits only a recognized `resConfigs` span.

| Path | Correction | SHA-256 |
|---|---|---|
| `app/index.tsx` | Connected BootScreenView; Retry via `useT` | `c1742a59a3c86c63aaaf59d1914f8a902a0d15ef12045a038d2aada9f12d711c` |
| `src/boot/BootScreenView.tsx` | Production boot wiring with injected surfaces (new) | `204d6fdaae374f2b52d768fd03fb513f8360acffbdee4f4d64acb743ff7f4918` |
| `src/boot/bootCompletion.ts` | Tickets + live snapshot at dispatch/publication | `88e147bc2b638584b54751633b5de4bd9d62c6bab4ebe9c3cc483728d567da14` |
| `src/boot/bootCompletion.test.ts` | EXTRACTED_RUNTIME stale Continue/Later/live-authority cases | `5bc6a0d9d0c63b982731da123c2f22f875f27e1c6aa272fe547a636296497433` |
| `src/boot/bootScreen.integration.test.ts` | MOUNTED_REACT_INERT_NATIVE BootScreenView harness (new) | `c4f2daff68530cf92e2967978f6258f653cc8b22a721191119e3f7d224e6812a` |
| `src/boot/BootAnimationGate.tsx` | Fonts/error must not block ready route or Retry | `f3be404d5919a13bae061171f1256a510197fcf82dc7211959ce2d855655f4c2` |
| `src/boot/bootProductionStartup.contract.test.ts` | Contract points at BootScreenView wiring | `a40e3e013605384a8f74e83becbc533a97b14507ef44a59bfe88a50522b668c9` |
| `src/boot/bootReleaseGate.contract.test.ts` | Overlay/font-block helpers | `884a689eceb6476b1c5eb4b349ff1756d0b3db7b01d443aa297471c33e58e5ff` |
| `plugins/withAndroidLocaleConfigs.js` | Replace only recognized locale declaration | `ad52f57df9ba6b0dc0a788455435007159721e00b159bcf396b3e55be2278a8d` |
| `plugins/withAndroidLocaleConfigs.test.ts` | Semicolon/neighbor/quoted-brace/unsupported fixtures | `30b54083acb1843e11bfad5a4ad71bb3caaaca677964f3dea5399bdfc5393c49` |
| `package.json` | Adds `test:boot-screen-integration`; lockfile unchanged | `31bd8d628ae9ea38d9e7b0574ac354a439c741e42645ab6be2ef5aa16b31674e` |

Locale plugin bytes at `a4dcfa4` are **preserved**. Review-account verifier bytes at `848eb9f` remain **preserved and closed**.

## Resolver-failure owner-change (after `a4dcfa4`)

Owner/session transition retires failure presentation as well as a displayed continuation, and restores the current owner's resolving/boot surface. Destinations are still taken from the current resolver; presentation timeout still does not invent a route.

| Path | Correction | SHA-256 |
|---|---|---|
| `src/boot/bootCompletion.ts` | `observeOwner` returns `hide_continuation` on any owner change | `4168912f2677fe32146ef65fc8a893b63dabad90eb942dc604ab0a57fc63d627` |
| `src/boot/BootScreenView.tsx` | Existing `hide_continuation` restores boot surface after failure retirement | `97e1ff7f80a96e959fa2496609b2c960aeb85b7fbf6ee122eccdadf177c09eed` |
| `src/boot/bootCompletion.test.ts` | EXTRACTED_RUNTIME failure→owner-change applyAction sequence | `0cb352a9819786a327d7dd44c35a8f8d94835e6d82a19e4e50c451e2befbc3b4` |
| `src/boot/bootScreen.integration.test.ts` | Mounted failure→B / signed-out / gen3 / late settlement cases | `12bce60b9be0d180e8018c715aadd4a65a05b4ea1d3f7b15144be50e67f1dc94` |

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
- Focused: diagnostics, boot production/release/completion/screen-integration, Expo public config, injected-Admin review-account tests (unchanged), locale plugin Gradle fixtures, typecheck, scoped ESLint of changed TypeScript paths
- `plugins/withAndroidLocaleConfigs.js` is validated by `test:android-locale-configs` (config-plugin source). Existing `lint:eslint` extra-globs do not include it. Direct ESLint of this JS file fails because the Expo flat config applies `@typescript-eslint/no-unused-vars` without loading `@typescript-eslint` for JS-only files. `eslint.config.js` was not changed.
- `test:boot-completion` is EXTRACTED_RUNTIME. It does **not** cover the mounted screen-integration cases.
- `test:boot-screen-integration` is MOUNTED_REACT with inert native/router/animation surfaces. It is not native rendering, TalkBack, Reanimated, or Play-installed proof.
- `test:play-review-setup` is INJECTED_ADMIN_OFFLINE and was not modified in this closeout.
- Canonical: `npm run ci:verify` on this resolver-failure owner-change head (not run `36843046525`, which belongs to `a4dcfa4`)
- Injected diagnostics tests do not prove native Crashlytics consent
- Boot tests do not prove mounted device animation
- Locale plugin tests do not prove Android resource shrinking on a device
- `npx expo config --type public` is a non-build config gate, not a native prebuild
