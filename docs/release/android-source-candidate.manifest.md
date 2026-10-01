# Android source candidate manifest

This is a **new committed source baseline** for review. It is **not** reconstructed vc22.
Exact source-to-installed-vc22 correspondence: **UNVERIFIED**.

## Owner-selected release scope (2026-10-01, integration branch)

GRIN completion is **required** for the owner's intended release. The core-only Internal build packet is **deferred**. Encrypted PDF backup remains backlog. Billing preparation may continue; activation is **not** authorized. VersionCode 23 is unchanged and is not a build approval.

See `docs/release/GRIN_IMPLEMENTATION_REGISTER.md`. G1 is emulator persistence only and is **not** GRIN-complete.

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
| Resolver-failure owner-change head | `c139507961b890c79a72f053158ade86d4b957d2` |
| **Accepted application head (frozen)** | `7e9e66055db20d5289424c61347bc72a64fd94e3` |
| Application CI (do not attach to later docs-only SHAs) | run `36864750074` / job `110377363521` / merge-ref `68d8b7fc4368414432b6a9ea0cbbd2d7f16a55da` |
| Docs-only preflight SHA | `cca0c5b8d2cb21f519ba40af5889f20e4b763711` |
| **VersionCode source SHA (proposed build source)** | `6e3dbba9b2173fbb5ffde8ffbbccd5b7dac3e559` |
| VersionCode CI (do not attach to later docs-only SHAs) | run `36874104343` / job `110408998132` / merge-ref `f922e2b1da988de30782818905bdf7dc72bfecb9` |

Imported deltas were taken from the historical **uncommitted** tree against that workspace’s own committed blobs. Those committed blobs matched `90c6948` for every included tracked file except `package.json` (security branch already added `test:safe-diagnostics`).

## App / package / version (source review only)

- `version`: `1.0.0`
- `android.versionCode`: **23** in source `app.json` after versionCode-only commit `6e3dbba9b2173fbb5ffde8ffbbccd5b7dac3e559`. Version name remains `1.0.0`. This is **not** a reservation of 23. Play complete inventory 2026-10-01T13:29:51Z: 22 active; 20, 19, 17, 16, 15, 14, 13, 10 inactive; **23 absent**. Recheck inventory before a later authorized build/upload.
- Package: `com.specialsoftwares.vyaamikkdiary`
- `eas.json` purchase-entry and quota-upsell flags were **explicit `"0"`** after `c139507` in `build.preview.env` and `build.production.env`. Other profile fields from `90c6948` are preserved (`EXPO_PUBLIC_APP_MODE=production`, `autoIncrement=false`, preview APK, production app-bundle). Development profiles still omit both flags (runtime default-off).
- No EAS remote environment write was performed.
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
- Auth, Rules, IAP internals, save locks, PDF services, navigation destinations, encrypted-backup, GRIN
- Server billing activation, Play product creation, and EAS remote env writes

## Unresolved / needs later owner action

- Installed vc22 correspondence remains unverified (separate from this candidate)
- Live Play review account is **not** created or verified here; `review:verify-account` is live-only and not run
- App onboarding may still require identity steps beyond the five Firestore fields the offline verifier checks
- Server fail-closed billing is unchanged. Client purchase-entry and quota-upsell flags are explicit `"0"` in preview/production `eas.json`. Hiding the Settings CTA is **not** a security boundary
- Source `app.json` declares versionCode **23** at `6e3dbba`. Do not re-upload 22. Play inventory (2026-10-01T13:29:51Z) makes **23** the next suitable unused code. This commit does **not** reserve 23.
- Live Firebase Rules were re-exported 2026-10-01: Firestore sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` (proposed compat patch, live since 2026-09-21); Storage still `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5`. See `docs/release/rules-compat/live-export-2026-10-01/META.json`. This assignment did not deploy Rules.
- Remote EAS `EXPO_PUBLIC_APP_MODE` exists as SENSITIVE. For eas-cli v16.28.0 configuration resolution, overlapping keys use **build-profile env**, so production profile `EXPO_PUBLIC_APP_MODE=production` wins over the unread remote value. Purchase-entry flags are profile-only `"0"`. This is configuration-resolution evidence, not build-worker/artifact evidence.
- Native/EAS build, OTA, deploy, Play upload: **not authorized**
- Encrypted PDF backup Phase 1 remains a separate design task. It is not in this candidate. G1 emulator persistence is authorized only on `integration/grin-g1-persistence`; G2–G6 still need a separate reviewed checkpoint. Production GRIN admission is not authorized.

## Validation boundaries

- Isolated worktree locked dependencies
- Focused: diagnostics, boot production/release/completion/screen-integration, Expo public config, injected-Admin review-account tests (unchanged), locale plugin Gradle fixtures, typecheck, scoped ESLint of changed TypeScript paths
- `plugins/withAndroidLocaleConfigs.js` is validated by `test:android-locale-configs` (config-plugin source). Existing `lint:eslint` extra-globs do not include it. Direct ESLint of this JS file fails because the Expo flat config applies `@typescript-eslint/no-unused-vars` without loading `@typescript-eslint` for JS-only files. `eslint.config.js` was not changed.
- `test:boot-completion` is EXTRACTED_RUNTIME. It does **not** cover the mounted screen-integration cases.
- `test:boot-screen-integration` is MOUNTED_REACT with inert native/router/animation surfaces. It is not native rendering, TalkBack, Reanimated, or Play-installed proof.
- `test:play-review-setup` is INJECTED_ADMIN_OFFLINE and was not modified in this closeout.
- Canonical application CI for frozen `7e9e660`: `npm run ci:verify` — GitHub Actions run `36864750074` / job `110377363521`, merge-ref `68d8b7fc4368414432b6a9ea0cbbd2d7f16a55da`, parents `0da2f58` + `7e9e660`, `test:all` 144/144, `ci:verify` PASS. That run does **not** cover later SHAs.
- Canonical application CI for versionCode source `6e3dbba`: GitHub Actions workflow **CI**, job **verify**, run `36874104343` / job `110408998132`, event `pull_request` attempt 1, conclusion **success**. Checkout `git checkout --force refs/remotes/pull/29/merge`. Merge-ref `f922e2b1da988de30782818905bdf7dc72bfecb9` (`HEAD is now at f922e2b Merge 6e3dbba9b2173fbb5ffde8ffbbccd5b7dac3e559 into 0da2f58970f23c7ce6cbefae6efffd49c731f44b`). Parents `0da2f58970f23c7ce6cbefae6efffd49c731f44b` (base) + `6e3dbba9b2173fbb5ffde8ffbbccd5b7dac3e559` (head). `test:all` **144/144** in 303.6s; **ci:verify PASS**. No `SKIP` lines in the job log. Do **not** reuse `36864750074`. Do **not** reuse `36847262564` or `36843046525`.
- Injected diagnostics tests do not prove native Crashlytics consent
- Boot tests do not prove mounted device animation
- Locale plugin tests do not prove Android resource shrinking on a device
- `npx expo config --type public` is a non-build config gate, not a native prebuild

## Purchase-entry closeout (after `c139507`)

Accepted boot/locale/diagnostics/verifier work is **preserved**. This closeout only stops the candidate from inviting users into an unavailable purchase flow. Billing is **not** enabled. Commercial policy, entitlements, quota enforcement, server validation, and IAP internals are unchanged.

### Flag consumers (traced before edit)

| Surface | Gate | Flag-off behavior |
|---|---|---|
| Settings → subscription management Upgrade CTA | `isSubscriptionPurchaseEntryEnabled` (`EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED === "1"`) | CTA hidden; existing `billing.management.purchaseEntryClosed` copy. Dispatcher `notifyManualUpgrade` / `presentUpgrade` still return `purchase_entry_closed` (hiding a button is not a security boundary). |
| Ordinary quota exhaustion (composer / PO / credit / pack save) | `isQuotaUpsellEnabled` via `decideQuotaUpsellEligibility` (`EXPO_PUBLIC_QUOTA_UPSELL_ENABLED === "1"`) | `gate_off`; `notifyOrdinaryQuotaUpsell` does not open UpgradeSheet. |
| Manual presenter / host `presentManual` | purchase-entry flag | Refuses with `purchase_entry_closed` before IAP purchase. |
| Current plan, usage, period, letterhead-included copy | none of these two flags | Remain on SubscriptionManagementScreen. |
| Manage-subscription URL | none of these two flags | `bindManage` preserved. |
| Restore | none of these two flags | Separate `bindRestore` / `restorePurchases`. Established handling preserved; live store restore is not claimed from source tests. |
| You tab | no purchase dispatch | Unchanged; quota warning can still deep-link to management. |
| Server `prepareAndroidBillingAccount` / entitlement writes | not these client flags | Untouched. Client still cannot write entitlements. |

Development EAS profiles omit both flags; runtime stays default-off unless env is exactly `"1"`.

### Bytes (content SHA-256 of this closeout)

| Path | Correction | SHA-256 |
|---|---|---|
| `eas.json` | preview + production explicit `"0"` for both purchase-entry flags | `420470814c57ea88324cf7cf2f0c1a8c2838269c6b72533c7b77e6389f6b1fee` |
| `src/components/billing/SubscriptionManagementScreen.tsx` | Hide Upgrade CTA when purchase entry is off; keep restore/manage/plan | `40a73b4585caf891e0498d7a7d5035b0dfda22f525f9f581bcce7491a3dd6c75` |
| `src/billing/quotaUpsell/quotaUpsell.contract.test.ts` | SOURCE_CONTRACT / file-string: eas.json `"0"` + CTA gating shape | `fb10854d22d3a4d01a60271d0d0bcd0a4119a5d4a5f04022004ac52c4f1fcd36` |
| `src/billing/quotaUpsell/quotaUpsellDecision.test.ts` | EXTRACTED_RUNTIME: flag-off ordinary + manual dispatch | `4d1157125abba4e071fd640731cdd9e821d47093ce140c6eb1caa9c28cb80ad3` |
| `src/billing/quotaUpsell/quotaUpsellHost.lifecycle.test.ts` | EXTRACTED host runtime + notify presenter (no React tree, not native SubscriptionManagementScreen, not Play purchase, not device restore) | `9e7faa12e47e8b23de913a51c23661cc29bd48d840074cfc707651f336ada7d7` |
| `src/subscription/subscriptionManagement.presentation.test.ts` | SOURCE_CONTRACT / file-string: CTA hidden + closed copy | `f0c63fef6484f179cbe476809829f0fba90a22d34dbd1c8dfbfc9d20d1df8e06` |
| `src/subscription/subscriptionManagement.runtime.test.ts` | EXTRACTED_RUNTIME (inert runtime, not mounted React): restore/manage still available when purchase entry is off | `7ed87f60ab6cffc90fda40bfa759bb7d59473635573b0f39d6c570077d1b2c78` |

Existing i18n key `billing.management.purchaseEntryClosed` (en/hi) is reused. No new commercial copy. No mock purchase-success path.

## VersionCode source preparation (after frozen `7e9e660` / docs `cca0c5b`)

Application diff is **only** `app.json` `android.versionCode` 22 → 23. Version name `1.0.0`, package, EAS production app-bundle, `autoIncrement=false`, `appVersionSource=local`, `EXPO_PUBLIC_APP_MODE=production`, both purchase-entry flags `"0"`, legal date `2026-07-27`, security ancestry, boot, locale plugin, and ledger V assets are unchanged.

| Role | SHA |
|---|---|
| Accepted application checkpoint | `7e9e66055db20d5289424c61347bc72a64fd94e3` |
| Docs-only preflight | `cca0c5b8d2cb21f519ba40af5889f20e4b763711` |
| **Proposed build-source (versionCode 23)** | `6e3dbba9b2173fbb5ffde8ffbbccd5b7dac3e559` |
| Current installed vc22 | Play Internal Active 22; exact source correspondence **UNVERIFIED**. This candidate does **not** reconstruct vc22. |

`app.json` content SHA-256 at `6e3dbba`: `3d2a8653bc4eb0cd94746788258fd96711d82eed4e30d0e1ef718624cff8fb3a`.

## Build-approval packet (request only — build and upload not authorized)

Build approval and Internal Testing upload approval remain **separate**. Neither is granted. No AAB exists for `6e3dbba`.

| Field | Value |
|---|---|
| Proposed build-source SHA | `6e3dbba9b2173fbb5ffde8ffbbccd5b7dac3e559` |
| Canonical CI | workflow **CI** / job **verify** / run [`36874104343`](https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/36874104343) / job [`110408998132`](https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/36874104343/job/110408998132) / success / merge-ref `f922e2b1da988de30782818905bdf7dc72bfecb9` / parents `0da2f58` + `6e3dbba` / `test:all` 144/144 / `ci:verify` PASS / no SKIP lines. Do not cite `36864750074`. |
| Package | `com.specialsoftwares.vyaamikkdiary` |
| Version name | `1.0.0` |
| Proposed versionCode | **23** (Play complete inventory 2026-10-01T13:29:51Z; later pager still 1–9 of 9 at 14:02:46Z). Not reserved. Recheck before upload. |
| EAS | account `vydspecial2026`; project `@vydspecial2026/vyaamikk-diary` (`00bb47ff-b22f-4a64-ace8-a0e7275fd2a1`); profile **production**; Android **app-bundle** (`eas.json` `build.production.android.buildType`); `distribution=store` (resolved); `environment=production`; `autoIncrement=false`; `cli.appVersionSource=local` |
| Effective public flags (configuration resolution, eas-cli v16.28.0 + `eas config`) | `EXPO_PUBLIC_APP_MODE=production`; `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED=0`; `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=0`. Profile env wins over remote Sensitive `EXPO_PUBLIC_APP_MODE`. Not artifact evidence. |
| Signing-role | Upload-key SHA-1/SHA-256 match Firebase. App-signing SHA-256 (Digital Asset Links) matches Firebase. App-signing SHA-1 not copied from Play text. Play Integrity API not integrated. |
| Live backend | Firestore live = proposed compat patch hash `b13d5255…` (since 2026-09-21). Storage = 2026-09-19 baseline hash. Billing Functions **are deployed**; enablement flags were **not** read. Client purchase-entry remains off. Repo-root Rules not live. |
| Server billing activation | **prohibited** |
| Security ancestry | `0da2f58` → `eb5f582` → `90c6948` preserved through `7e9e660` into `6e3dbba` |
| GRIN / encrypted backup | Frozen core candidate (`6e3dbba` / PR #29) still excludes GRIN. Owner-selected intended release now **requires** GRIN completion; this integration branch starts G1 only. Encrypted PDF backup remains backlog. Not legal immunity. |
| Native/device checks | outstanding (checklist below) |
| VersionCode source preparation | **complete in source** (this assignment) |
| B. EAS production AAB build | **not authorized** |
| C. Internal Testing upload | **not authorized** |
| Public release | **not authorized** |

Clean-tree requirement: a separately authorized EAS production AAB must be built from a clean checkout of the **build-source SHA** (`6e3dbba` unless a later authorized application commit supersedes it), not from a dirty tree and not from a later docs-only SHA.

### Required artifact evidence after a future approved build (not run)

- EAS build ID
- Actual source SHA used by the worker
- AAB SHA-256
- Package and versionCode extracted from the AAB
- Signing certificate role
- R8 mapping availability
- Resolved build settings for the three public flags above

### Required evidence after a future approved Internal Testing upload (not run)

- Artifact verification of the fields above
- A **current** complete Play inventory check (23 is unused as of 2026-10-01T13:29:51Z, not reserved)
- Upload to **Internal Testing only**. No production track. No public submission.

Installed vc22 provenance remains a separate unresolved historical fact.

## Evidence chronology (do not collapse these)

**A. Owner-reported history (not a Play read):**
- vc21 EAS build `5e1e124b-7a8c-49ec-a4bb-2b7264844dc4` was reported uploaded to Internal Testing.
- vc22 EAS build `72cb7254-0be9-4f92-a514-dbfab2b1150d` was reported finished as a production AAB.
- Exact source correspondence of installed/uploaded vc22 remains **UNVERIFIED**.

**B. Earlier direct observations (historical; not current):**
- 2026-09-19 Play uploaded versionCodes: 17, 16, 15, 14, 13, 10. 18 unused *then*.
- 2026-09-20 Console: Internal Testing RC4 **vc17**; Production Inactive. That is **not** the current internal release.

**C. Fresh observations this assignment (2026-10-01):**
- Play Console session: `aeadmin@specialsoftwares.com` / SPECIAL SOFTWARES, developer `5171346189091805855`, app `4972339006118168782`, package `com.specialsoftwares.vyaamikkdiary`. Draft app; temporary unreviewed package name. No Save, create, upload, or track mutation.
- Complete App bundles inventory (All app bundles, unfiltered, pager **1–9 of 9**, 2026-10-01T13:29:51Z): **22 (Active), 20, 19, 17, 16, 15, 14, 13, 10 (Inactive)**. Not present: 21, 18, 23, 11, 12.
- Current Internal Testing (2026-10-01T13:30:32Z): track **Active**; latest release **Vyaamikk Diary (Vc22)**; version codes **22** only. Do not cite vc17 as current.
- Production track (2026-10-01T13:31:03Z): **Inactive**. No production release.
- Play Integrity API: **not integrated** (Protected with Play, 2026-10-01T13:31:39Z). App signing fingerprints re-read 2026-10-01T14:06Z (upload-key SHA-1/SHA-256 and app-signing SHA-256 matched current Firebase Android hashes; app-signing SHA-1 not in page text).
- A finished EAS build is **not** proof of a Play upload. vc21 exists on EAS and is **absent** from the current Play AAB inventory. vc22 exists on both EAS (finished) and Play Internal (active).

## Read-only internal-build preflight (2026-10-01)

**Not a build. Not an upload.** Application source after this assignment is versionCode-only on top of frozen `7e9e660`.

| Read | Fresh result |
|---|---|
| Complete Play uploaded-version inventory | **Read** via authenticated Play Console All app bundles (`bundle-explorer-selector`), unfiltered, **1–9 of 9**. Codes above. Missing `gcloud` / `googleapiclient` did not block this Console read. |
| Current Internal Testing | **Vc22 / versionCode 22**, track Active. |
| Production track | **Inactive**. |
| EAS account/project | `npx eas-cli@16.28.0` (npx cache, not repo `node_modules`). whoami `vydspecial2026` (Owner). Also Owner of `special-softwares`. Project `@vydspecial2026/vyaamikk-diary` ID `00bb47ff-b22f-4a64-ace8-a0e7275fd2a1`. Expo website login was a sign-in wall; CLI session was used instead. |
| EAS production / preview profiles (source `eas.json`) | production: `android.buildType=app-bundle`, `environment=production`, `autoIncrement=false`, `cli.appVersionSource=local`. preview: APK, `environment=preview`, `autoIncrement=false`. Both set `EXPO_PUBLIC_APP_MODE=production` and both purchase-entry flags `"0"`. Recent EAS history: production builds are `distribution=STORE`; preview builds `INTERNAL` — consistent with those profiles. |
| Remote EAS env (production and preview lists) | Purchase-entry and quota-upsell names **absent**. `EXPO_PUBLIC_APP_MODE` **present**, Visibility **SENSITIVE**, value **not read**. eas-cli v16.28.0 + `eas config` overlap warning: profile env **wins** for `EXPO_PUBLIC_APP_MODE`. Effective configuration-resolution public flags: APP_MODE=`production`, both purchase-entry flags=`0`. Not build-worker/artifact evidence. No EAS remote write. |
| Package identity | Source `app.json` at `6e3dbba`: `com.specialsoftwares.vyaamikkdiary`, `1.0.0`, versionCode **23**. `npx expo config --type public` with the three production-profile public flags set: same package / `1.0.0` / 23. Play Console shows the same package. |
| Signing-role | Play App signing page 2026-10-01T14:06Z (read-only). Upload-key SHA-1/SHA-256 match Firebase Android hashes `20f8150e…` / `e688fa0b…`. Digital Asset Links app-signing SHA-256 matches Firebase `b9c521e3…`. Play App signing SHA-1 value was not in page text (copy control only); Firebase also lists SHA-1 `d223f0a5…` as the remaining registered hash. Play Integrity API still **not integrated**. |
| Firebase / live Rules | **Exported 2026-10-01.** Firestore live sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` (proposed compat patch; ruleset `a19b4a83-…`; updated 2026-09-21). Storage still `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5`. This assignment did not deploy. Repo-root `firestore.rules` is not live. Do not use the 2026-09-19 baseline as current live Firestore. |

**Proposed unused versionCode: 23 — applied in source** at `6e3dbba`. Highest uploaded Play AAB at 2026-10-01T13:29:51Z is 22. 21 and 18 remain unused on Play but are **not** suitable because 22 is already uploaded. This does not reserve 23.

## Device and reviewer checklist (later authorized binary — all pending)

Do not create/modify the reviewer account or run live verification in this assignment. Injected-Admin offline tests are not reviewer-access proof.

| Case | Status |
|---|---|
| Cold start and Reduce Motion | pending |
| Returning sign-in and incomplete onboarding | pending |
| Reviewer account fresh sign-in reaches dashboard | pending |
| Ordinary save and same-ID retry | pending |
| Letterhead create / PDF / share | pending |
| Process death and PDF recovery | pending |
| Account switching and retired content | pending |
| Purchase entry absent | pending |
| Current plan / manage / restore presentation | pending |
| Five supported languages after shrinking | pending |
| Consent-controlled diagnostics and native failure recovery | pending |

Owner still must complete onboarding on the intended production binary. Read-only account verification is a separate later authorization.

