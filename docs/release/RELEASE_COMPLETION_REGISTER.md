# Release completion register — Internal GRIN / billing / public candidate

## Five-issue closeout — 17 Oct 2026

Parent latency candidate `fe7c2ffb01547f883244e9d20b6192db86db55d4` stays unchanged. The earlier five-issue application commit `eef594fd600dff2e1f7eab463730de688aed9d43` stays in history. Its canonical CI run `39026317234`, verify job `117377892404`, remains the proof for that SHA only. The closeout application SHA is `308f77ede61508fb86fabdb15e7087a825417c15` on `correction/five-issue-release`. Canonical CI run `39041260970`, verify job `117421069048`, success, head exactly that SHA. https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/39041260970 This paragraph is the register note for that run. It is not a new application commit and it does not replace that CI result. The versionCode 29 freeze `5746c94` and its AAB are unchanged. No EAS build, Play upload, website publication, billing change, or server-ledger rollout is authorized.

SOURCE. The You Upcoming tile and the Upcoming detail use the same eligibility rules for diary entries, professional packs, and customer-credit rows. A future receivable credit counts in both. An overdue credit stays in the overdue detail section and is not in the tile total. A cancelled or non-receivable credit is excluded from both. Rows are not dropped to force the numbers to match.

SOURCE. The diary list publishes the durable local overlay before the remote list returns. A diary create, edit, or delete refreshes that overlay and does not request the cloud history again. Pending local rows still replace the remote row with the same id. A permanent delete hides that id until a later remote list no longer contains it. A later upsert of the same id clears that hide. The product delete is permanent; there is no separate restore action.

SOURCE. Diary, calendar, You credit and pack loads, and the insights dashboard drop a result unless the uid, session generation, and, for the diary list, the query identity are still current. An account change clears the previous rows before the next paint. Calendar diary changes apply the local overlay. They do not start a new full diary cloud read.

SOURCE. Create, edit, and delete publish for diary, professional-pack, and customer-credit mutations those screens count. A remote diary create or update publishes only when the acknowledgement applied. A remote diary delete publishes after the remote delete is accepted.

SOURCE. Crash-report consent in the bridge, the first-run host, and the settings switch goes through the diagnostics preference. A newer opt-out, including one whose save failed, closes reporting before a delayed stored-true read can apply. Rapid choices are serialized. The native collection default in `firebase.json` stays off. No telemetry provider was added. The preference does not send an account id. Native pending-report deletion was not exercised.

SOURCE. Callable auth cleanup no longer attaches a detached `finally` to a rejected token read. A handled token failure does not leave an unhandled cleanup rejection. Save timing records `remote_ack` only when the remote create was accepted. Local acknowledgement still happens before that, and pending or failed saves do not take the remote-ack mark.

HOST. Injected clocks cover midnight and the Upcoming day boundary. The mounted-controller proofs for local-before-remote, edit, delete, restore-as-later-upsert, and A→B / logout / stale query are Node tests of the production list and session functions, not a phone. Chrome rendered the production work-note HTML to a PDF page and a screenshot. The page footer reads “Created using Vyaamikk Diary.” The word “certified” is not on that page. Android Print was not run.

SOURCE, not a device. Fixture calendar targets open `/(app)/diary/[id]` and `/(app)/professional-pack/[id]` with `fixture-payment` and `fixture-pack`. The hero card still animates toward the destination height in source. Its frame timing was not measured on a phone. That measurement is unperformed device work, not a missing source wire.

LEGAL, UNPUBLISHED. `docs/legal/PRIVACY_POLICY.md` and `docs/legal/PUBLICATION_HANDOFF.md` are the ready-to-publish Privacy draft and the Privacy/Terms crosswalk. Consent versions stay `1.0.0`. The live website was not changed and has not been checked, so this register does not say the public pages contain the new text.

Not performed, and not labeled as a finished device check: phone animation frames, native Crashlytics pending-report behavior, console receipt, website publication, emulator UI, and a Play install. No Android device was connected for this closeout.

### Next Internal packet — not authorized

Recheck Play before choosing a versionCode. The last inventory read, 16 Oct 2026, showed bundle 28 Active and 29 absent. Do not reuse 28 or 29. Do not assume 30. Do not build this SHA until that inventory is read again. Purchase entry and quota stay off. Server ledger projection stays off. Do not deploy Functions, Rules, or indexes. Do not build `308f77ede61508fb86fabdb15e7087a825417c15`. Its canonical CI is run `39041260970`, verify job `117421069048`.

## Five-issue correction — 17 Oct 2026

Parent latency candidate `fe7c2ffb01547f883244e9d20b6192db86db55d4` stays unchanged. Application candidate `eef594fd600dff2e1f7eab463730de688aed9d43` on `correction/five-issue-release`. Canonical CI run `39026317234`, verify job `117377892404`, success, head `eef594fd600dff2e1f7eab463730de688aed9d43`. It is not the versionCode 29 freeze `5746c94` and it is not an installed binary. No EAS build or Play upload is authorized.

| Content class | Decision |
| --- | --- |
| Generic non-certification on party ledger, Insights freshness, cash subtitle, statutory tab | Removed from those UI strings. The substance is in Terms (`src/content/legal/documents.ts`). |
| Device-counted status | Kept as a short factual line. |
| Official-portal check for statutory dates | Kept in VyaaFlow copy. |
| Camera, location, deletion, and crash-report consent | Kept. |
| Historic PDFs | Not rewritten. |

This paragraph records `eef594f` only. The closeout section above is the later status.

SOURCE. Calendar markers and the tapped day use the same date roles. A due date is a follow-up marker, not an ordinary entry marker. The visible month is independent of the selected day. Statutory calendar dates are generated for the visible window without writing reminder rows. Diary and pack loads are not sliced at 1,200, 500, 80, or 25 after the repository returns. A failed source does not clear the sources that succeeded. A durable diary commit and a successful professional-pack create publish an owner-scoped change. Last 7 days is `[start of today−6, start of tomorrow)` and excludes future records. Upcoming counts future actionable dates; overdue stays a separate detail section and is not part of that total. The route name stays `this-week`. The hero height animates toward the destination face. Settings groups are Profile & Business Identity, Business, Account & Security, Support & Diagnostics, and Legal & Policies. Privacy, Terms, the legacy legal route, and the disclaimer route use the public HTTPS opener. A failed crash-report preference write does not turn reporting back on. Crash reports do not receive an account-id prefix. Website publication of the legal pages is not verified. Phone frame timing, populated agenda navigation on a device, native Crashlytics pending-report deletion, and console receipt stay DEVICE_PENDING / NATIVE_DEVICE / LIVE_PENDING.

### Next Internal packet — not authorized

Recheck Play before choosing a versionCode. Do not reuse 28 or 29. Do not build this SHA until that inventory is read again. Purchase entry and quota stay off. Server ledger projection stays off. Do not deploy Functions, Rules, or indexes.

---


Coordinator register. Not authorization. Not a “bug-free” promise.
Target public availability **18 October 2026** is a delivery date, not a gate
bypass and not a Play-approval promise.

Wave 2 is **not** accepted. Encrypted PDF backup remains backlog.

Evidence labels: SOURCE / INJECTED / SQLITE_HOST / EMULATOR / FIXTURE /
MOUNTED_INERT_NATIVE / NATIVE_DEVICE / PLAY_INSTALLED / LIVE_BACKEND /
DEVICE_PENDING / TOOLING (ops-guard suite; not application CI).

---

## VyaaFlow, cash voucher, and party ledger — frozen, 16 Oct 2026

Application source is `7f853aeac1e74cc0aa23161a6b001e316e05edc5`. Canonical CI is workflow_dispatch run `38798251247`, verify job `116640250952`, success, head SHA matched. This paragraph is a later register note and is not that source commit. Runs `38793093634` and `38795572555` failed on earlier commits of the same branch and do not cover this SHA. Run `38737635731` covers only the earlier simplification commit `3c2361e`.

The integration branch already contained the four tracks before this closeout. Layout is `e673228`. The party-ledger projector is `8e83dc8`, merged as `19be30f`. The explorer is `17beadf`, merged as `2eda852`. The cash voucher is `4e05c03`, merged as `ef543ec`. Locale lines are `0d94a4a`. The worktree `team/vl-a3-ledger` still points at `8e83dc8` because that commit was merged; it was not left uncommitted. This closeout adds the durable follow-up, the ledger transaction, and the rendered-page proof in `679f412`, `ae8325b`, and `7f853ae`. `CURSOR_CONTEXT_EXTRACTION.md` stayed untracked. The dirty main workspace was not reset.

HOST_CHROMIUM. Fresh pages were rendered from the production generic cash-record HTML and the dedicated cash-payment voucher HTML. The fixture is a 280×180 image with a blue corner and a red field, then the same shape in green for the replacement. The decoded page pixels kept the blue corner and the field colour. The laid-out box was 280×180 on the generic page and 282×182 on the voucher, matching the image ratio, so the picture was not cropped. The first document contains the red image. The regenerated document contains the green image and not the red one. A missing local file returns unavailable, with retry and generate-without-photo, and does not emit HTML. Three host renders: p50 1006 ms, p95 1381 ms. Android expo-print was not run. That gate stays DEVICE_PENDING.

SQLITE_HOST. Twenty-one creates on the production local-first path, in Node memory SQLite, not on a phone. Local acknowledgement p50 0.21 ms, p95 0.75 ms. The photo, PDF, and ledger rows were already in SQLite when local success was signalled. After the database was reopened, resume continued the same voucher ids, did not create another voucher, and did not add another create outcome. An older photo revision could not mark the newer row done. A different session could not resume or apply the first owner's job. Remote acknowledgement and Cloud Storage upload were not measured on this host. Those two stages stay DEVICE_PENDING. The percentile helper test on the numbers 1 through 5 is not this measurement.

FIRESTORE_EMULATOR. Accepted create, replay, conflicting command, stale epoch, edit, and delete ran through the admin transaction and `applyAcceptedSource`. Two different records applied together. A path owner that does not match the source is denied before a write. Owner read of a projection bucket succeeded. Client create and update of projections and buckets were denied. An ordinary diary entry create still succeeded. The checkpoint document records the last applied source. `PARTY_LEDGER_SERVER_PROJECTION_ENABLED` stays false. `functions/src/index.ts` does not export the trigger, so a functions deploy does not register it. No composite index is required for these document reads. The backfill plan is written and was not executed. This is not deployed behaviour and not a live balance.

SQLITE_HOST. The party list was loaded through `loadLocalPartyLedger` from the local diary repository. A name-only party stayed provisional. The screen copy still says the figures are counted on this device and are not a certified ledger. Business Insights source does not import the party ledger. Populated list and detail on a device, including search, large text, Back, and account retirement, were not exercised. No Android device was connected. That UI stays DEVICE_PENDING.

SOURCE. VyaaFlow's agenda list owns its end spacing and does not reserve the tab bar a second time. The You footer path is unchanged. Native measurement of a long agenda and an empty date was not run. No Android device was connected. That measurement stays DEVICE_PENDING.

### Next Internal packet — not authorized to build or upload

- Frozen candidate: `7f853aeac1e74cc0aa23161a6b001e316e05edc5`. Canonical CI: run `38798251247`, verify job `116640250952`.
- Recheck Play bundle explorer before assigning a versionCode. Do not reuse 28. Do not assume 29.
- The upload authorization for `1ca361ca8c61e1b9b8e8182f22b4e38128556ee0` does not cover this SHA.
- Profile `internal-grin`. Purchase-entry `0`. Quota-upsell `0`. Restricted billing stays one admitted Firebase UID and Starter monthly.
- Do not revoke the live Maps key until a replacement Internal build that does not embed it is the acceptance build.
- Do not deploy Functions, Rules, or indexes. Do not run the party-ledger backfill. The server projection flag stays off.
- Android expo-print, device save timings, and the populated VyaaFlow and party-ledger screens remain DEVICE_PENDING.
- No public rollout, no EAS build, and no Play upload in this closeout.

## Product simplification candidate — frozen, 15 Oct 2026

This section is the integrated correction after the released Internal binary. It is not an EAS build and not a Play upload. A local debug APK was installed only on the disposable emulator, as recorded below. `app.json` still says versionCode 28 because that code is the released binary. Do not upload this source as versionCode 28. Recheck Play bundle explorer before assigning the next code. The existing Internal upload authorization covered `1ca361ca8c61e1b9b8e8182f22b4e38128556ee0` only.

Letterhead is no longer offered on the landing page, the new-record picker, or the subscription screens. No replacement plan benefit was added. Saved letters, drafts, PDF share, ownership checks, and deletion stay. `/(app)/letterhead`, `setup`, and `generate` still redirect to history. `/(app)/letterhead/create` without a saved id redirects to history; with an id it stays the reader. Stored type names such as `letterhead_matter` are unchanged. The calendar section for those rows is labelled “Saved letters.”

Business PINs, the map panel, marker clustering, and `react-native-maps` are removed. `app.config.js` does not read `GOOGLE_MAPS_ANDROID_API_KEY` and does not write a Maps key into the manifest or `extra`. The live Maps key was not revoked, because versionCode 28 still uses it. `expo-location` stays for the explicit Detect my PIN action on record forms. Manual From and To PIN fields stay. `/(app)/map` and Business Insights `pins` redirect to VyaaFlow. The distance screen redirects to Goods & Movement. Approximate kilometres are no longer shown on the year recap, search snippets, or the You identity card. The distance helper remains in the calculation code and is not a migration. Historic coordinates are not rewritten.

VyaaFlow keeps the calendar, the day agenda, and filters for all records, this business, and statutory reminders. Statutory reference opens the existing `/statutory` library. Settings no longer has a Statutory Information row or Last Active, and the Settings hero no longer says statutory dates. English, Hindi, Gujarati, Tamil, and Telugu each describe account, identity, billing, and app preferences. Previous visit stays on the You card. Subscription, account deletion, privacy, and sign-out stay in Settings.

Business Insights overview keeps the year selector, one freshness line, summary cards, and four categories: Money & Dues, Goods & Movement, Customers & Parties, and Work & Records. Each figure’s explanation and record link open from its category. Customers & Parties has no engine id and opens the existing party and shop-customer lists.

SOURCE. The upgrade sheet still says “Plans are unavailable right now” and “Purchases are not available in this build” when no subscription row is ready. Store connection does not read the purchase-entry flag. The billing session connects when `expo-iap` is present on Android or iOS and the app is not Expo Go or web. The catalog query then requests `vyd_starter`, `vyd_professional`, and `vyd_business` as subscriptions. An empty product list is recorded as `store_not_configured`. A product whose offer is rejected is recorded as `unsupported_offer`. OpenIAP 3.5.1, the Android library used by expo-iap 5.6.0, labels a Play base plan with no offer id as type `introductory` and copies the base-plan id into the offer id. A normal paid price on an infinite phase is pay-as-you-go, not a free trial. The previous selector treated `introductory` as a trial before it read the price, so a returned Starter monthly base plan became `unsupported_offer`. That mapping failure is from the library bytecode and this source. It is not a reading of the owner’s phone. The selector now rejects promotional and free-trial rows, and still rejects a zero price, more than one phase, or a finite cycle. One paid infinite phase whose id equals the expected base plan id is kept. `iapOffers.test.ts` covers that shape. Purchase-entry and quota-upsell stay `0`. No additional plan was activated. Purchase tokens, offer tokens, and account identifiers were not logged.

INJECTED. `admittedUpgradeSheet.test.ts` supplies a ready priced Starter monthly row and proves the sheet can dispatch `vyd_starter_monthly` while purchase-entry is `0`. It does not call Play and does not explain the installed catalog.

DEVICE_PENDING. The owner’s phone was not available, so the live connection state, the returned product list, and Play’s rejection reason were not captured. A failed connection, an empty product list, or a base plan Play does not return would still show the unavailable lines. This register does not call that installed screenshot “not a source defect.”

Application source is `3c2361e66f624733524724d287bd0ee4593e6554`. Canonical CI is workflow_dispatch run `38737635731` / verify job `116430897101`, success, head SHA matched. The pull_request run `38737612581` on the same SHA also succeeded. This paragraph is a later register note and is not that source commit. The previous source `d64309dd650079b21a9661723f9a2d0ac4ecc97d` and CI run `38730168856` / job `116405713916` do not cover this commit.

EMULATOR/FIXTURE. Populated Insights ran on emulator-5554 (`sdk_gphone64_arm64`, debuggable, `installerPackageName=null`) before this commit. Metro loaded the corrected JavaScript that became `3c2361e`, with a temporary in-memory fixture that called `buildOwnerInsightCoverage`. That fixture was removed before the commit. The native shell for those screens was versionCode 27, not a build of this SHA. FY 2026-27 overview showed 4 records, 1 PDF, ₹2,000 cash paid, and ₹2,000 pending. Money & Dues showed ₹2,000 cash, ₹500 collected, and ₹2,000 still open, and the cash counting explanation expanded. Goods & Movement showed 12 bags sent. Customers & Parties showed 2 parties and 1 shop customer. Work & Records showed 1 work record and 1 open draft. View source records opened Your Diary for cash and Saved drafts for the draft figure. The fixture rows were not written into those stores: the diary list showed the existing permissions error, and Saved drafts was empty. Header Back returned from the diary to Money & Dues and from Goods, Customers, and Money to the overview. From Saved drafts, Back returned to You. Overview, the category, the explanation, and Back were repeated at system font scale 1.3, then the scale was restored to 1.0. The Settings hero at both sizes read “Account, identity, billing and app preferences.”

Local native debug, not EAS and not Play. `android/` was deleted and generated again from `3c2361e`. `:app:assembleDebug` succeeded. The APK is `android/app/build/outputs/apk/debug/app-debug.apk`, versionCode 28 / versionName 1.0.0 only because `app.json` still says 28. It was installed only on emulator-5554. After install the package was versionCode 28, debuggable, and `installerPackageName=null`. The manifest has location permission and `com.android.vending.BILLING`, and it has no `com.google.android.geo.API_KEY`. The debug runtime classpath includes expo-location 19.0.8, play-services-location 21.0.1, openiap-google 3.5.1, and billing 9.1.0. It does not include `react-native-maps` or play-services-maps. VyaaFlow launched on that shell and showed the October 2026 calendar and the statutory-reminder notice. The live Maps key was not revoked. Do not upload this APK.

Goods sent / transport still requires a valid From PIN and a valid To PIN before save. That rule is `refineRequiredPin` in `src/utils/businessEntry/validation.ts`, present before this candidate. Detect my PIN stays a separate button on the same fields.

### Previous next Internal packet — superseded by the 16 Oct voucher and ledger candidate

- Frozen candidate: `3c2361e66f624733524724d287bd0ee4593e6554`. Canonical CI: run `38737635731`, verify job `116430897101`.
- Recheck Play bundle explorer before assigning a versionCode. Do not reuse 28. Do not upload the local debug APK.
- The upload authorization for `1ca361ca8c61e1b9b8e8182f22b4e38128556ee0` does not cover this SHA.
- Profile `internal-grin`. Purchase-entry `0`. Quota-upsell `0`. Do not activate additional base plans. Restricted billing stays one admitted Firebase UID and Starter monthly.
- Do not revoke the live Maps key until a replacement Internal build that does not embed it is the acceptance build.
- The owner’s Play catalog response remains DEVICE_PENDING.
- No public rollout, no data purge, and no EAS or Play operation in this closeout.

## Internal versionCode 28 — 15 Oct 2026

Play bundle explorer, read before this freeze: 14 bundles. Highest uploaded version code is 27 (1.0.0). A search for 28 returned no bundle. `app.json` versionCode is now 28, version name stays 1.0.0. The `internal-grin` profile keeps purchase-entry and quota-upsell at `0`. The Maps key remains the existing EAS production secret and is not in git. This commit freezes that build. It is not the upload and not a public rollout. Restricted billing stays the one approved Firebase UID and the Starter monthly plan.

## Business Insights candidate — 15 Oct 2026

Application source `4176c74cc4480d2afee7c87cc56f3391bbe22ffd` on `integration/grin-g1-g5-source`. It keeps the accepted dashboard correction `a2a49f94bc157c566d7dc7d962b0148ed84a56b1` (CI run `38625795637` / verify `116064495127`). Canonical CI for this source is workflow_dispatch run `38647967468` / verify job `116139460943`, success, head SHA matched. This paragraph is a later register note and is not that source commit. Coordinator checks on this tree are not independent QA.

The settings name is Business Insights. Hindi is व्यावसायिक अंतर्दृष्टि, Tamil வணிக நுண்ணறிவு, Telugu వ్యాపార అంతర్దృష్టులు, Gujarati વ્યવસાય અંતર્દૃષ્ટિ. The sentences inside each figure come from those locale catalogs. Diary amounts are stored as rupees; the diary amount field is defined as INR. A value that is not a usable rupee amount is left out and is not labelled as another currency. A goods-receipt invoice with a blank or missing currency code is not added as INR. Each row shows its period, its counting rule, and a link to the contributing records. Empty and unread rows say the figure was left out. The freshness note says when the device is offline, when on-device diary rows are still unsynced, or when the server diary list could not be read. Unsynced diary rows already on the device are included. Figures reload when the screen is revisited and when sync state changes. The existing scan caps stay. A different account or session drops the previous result. Coverage is in `docs/release/packets/BUSINESS_INSIGHTS_COVERAGE.md`.

The same source also carries VyaaFlow (business dates and Business PINs, with Detect my PIN only after confirmation, and no new GPS footprint on save) and profile appearance, language, and the device-local previous visit.

Owner-phone You-dashboard acceptance on vc27 remains FAIL. The disposable-emulator fixture pass belongs to `a2a49f94` only. This SHA was not installed on an emulator or on the owner's phone. Map tiles are unverified because the Maps SDK for Android key is still absent. No EAS build and no Play upload of this SHA.

Billing is unchanged. The last Publisher diagnostic is HTTP 401 `permissionDenied`, domain `androidpublisher`, for `982505811909-compute@developer.gserviceaccount.com`. That probe was not repeated. KMS PASS stays. `PLAY_BILLING_ENABLED` stays unset. Catalog products are not created. The Play Console RTDN checkbox stays off. Purchase admission stays closed. This is not a public release. versionCode 28 was not allocated.

## Option A — Internal phone validation and BillDesk APK — 14 Oct 2026

This section replaces the earlier reads that versionCode 26 was the latest Internal release and that no licence-testing list was selected. It is a record of the artifacts. It is not a new application candidate, a purchase, or a public rollout.

Play bundle explorer, read before the upload: 13 versions. Highest was versionCode 26 (1.0.0), Active. A search for 27 returned no results. EAS Android history also stopped at 26. `app.json` already had versionCode 27, so the code was not bumped.

Application corrections stay `6499d207c795bce492fec20b44a18e07bef6fd0f`. Canonical CI for that SHA remains run `38583297726` / verify `115918562795`, success. The build commit is `3df543e42482d3f516cac7b58da77000bde9e213`, which only adds the same-source APK profile, the Internal submit track, and the isolation asserts. Its canonical CI is run `38588432103` / verify `115936580435`, success, head SHA matched. No EAS build started before that run succeeded.

| | Internal Play AAB | BillDesk APK |
|---|---|---|
| Profile | `internal-grin` | `internal-grin-apk` |
| Distribution | store | internal |
| Artifact | app bundle | APK |
| Environment | production | production |
| Purchase entry | `0` | `0` |
| Quota upsell | `0` | `0` |
| GRIN flags | both `1` | both `1` |
| EAS build | `47e9f38b-e9f3-4e30-8b2b-3412c06e4b3c` | `0a903e8c-6fb1-4550-95af-1c7b60e95f35` |
| Git commit | `3df543e42482d3f516cac7b58da77000bde9e213` | same |
| Package | `com.specialsoftwares.vyaamikkdiary` | same |
| Version | 1.0.0 / **27** | 1.0.0 / **27** |
| SHA-256 | `cd4fd569e1f754653b23602e115164463d2ba5d96c2b09cc02eaf3284f972585` | `f6eccf44d5afb02e4ebe6a61f7f35b4aacf40203562837d93a3bd4bfd1500602` |

`preview` was not used. It is a different environment and does not set the GRIN flags. `production` stays an app bundle with GRIN off. `eas submit` has no Play service-account key, so the AAB was published from the Play Console Internal release, not from `eas submit`. The submit profile `internal-grin` remains track `internal` / `completed` and was not executed.

Both files are signed by the upload certificate on the App signing page (SHA-1 `20:F8:15:0E…`, SHA-256 `E6:88:FA:0B…`). That certificate is not the Play App Signing certificate (`D2:23:F0:A5…`). The APK cannot update a Play-installed copy in place. The OnePlus update is the Internal Play release only. Do not uninstall it and do not clear its data. Do not sideload this APK over that install.

The APK HTTPS link was fetched twice, both times HTTP 200, 123114624 bytes, and the same SHA-256. It expires 2026-10-28. The link is `https://expo.dev/artifacts/eas/H04QkJy2Pdyd9aDFitfMw3qu9a6io6wv7wB00s3knlU.apk`.

Internal testing is Active. Latest release is **27 (1.0.0)**, one version code, available to internal testers, released 14 Oct 22:05, not reviewed. Version 26 is the previous release and was not included in this release. Tester membership was not edited: the Owner list stays selected (3 users) and Known Testers stays unselected. Save on that tab was disabled. Production is Inactive and has no release.

Licence testing, read and not changed: the Known Testers email list is selected (4 users), the Owner list is not, and the licence response is RESPOND_NORMALLY. That is separate from Internal tester membership. No purchase was started.

Play Console real-time notifications stay off. The topic field is empty, the content choice is “Subscriptions and voided purchases only,” and Save is disabled. A new-grant RTDN while `PLAY_BILLING_ENABLED` is not exact `true` is rejected in the handler as retryable `play_billing_disabled`, and `rtdnHttpStatusForError` maps that to HTTP 503 so Play does not treat it as delivered. Already-owned lifecycle is not stopped by that flag. This is not a Play frontend outage. Do not enable the checkbox, and do not turn payment admission on. KMS PASS was not repeated. Catalog products were not created.

You dashboard native acceptance on vc27 is **FAIL**. The owner’s phone, after the Internal update from `3df543e`, still shows New record covering At a glance. The earlier host contract is not closure.

The correction stops subtracting the tab bar a second time. Installed `@react-navigation/bottom-tabs` 7.16.2 puts the scene in a `flex: 1` container and the tab bar as the next column sibling (`BottomTabView.js`). `absoluteFill` applies only inside that container. `SafeAreaProviderCompat` is `flex: 1`. App tabs do not set `position: "absolute"` on the bar. Screenshot gap arithmetic remains supporting evidence only. The three At a glance tiles stay one row, so the last tile shares that row’s vertical span. At font scales 1, 1.15, and 1.3 the row still fits the scroll viewport above the in-flow New record footer on 640, 800, and 900 dp windows, for 24 dp and 48 dp bottom insets, including when the row starts 4000 dp down the content. That check is a host contract.

Emulator `Vyaamikk_Pixel_API35` booted as `emulator-5554` at 1080×2400. The installed `com.specialsoftwares.vyaamikkdiary` is versionCode 7, debuggable, last updated 2026-08-07. It is not vc27 and it is not this correction. No prebuild, `expo run:android`, EAS build, or Play upload was started. Rendered bounds of the correction stay **DEVICE_PENDING**.

Canonical CI for the correction `a2a49f94bc157c566d7dc7d962b0148ed84a56b1` is run `38625795637` / verify `116064495127`, success, head SHA matched. That run is not a device pass, a rebuild, or an upload. This sentence is a later register note and is not the correction.

## Letterhead removal is the integration head — source only

PR #34 is merged into `integration/grin-g1-g5-source`. The Letterhead application source is `1792d79a7a3b58cae5913e6d46ccef4902bfcb37`. CI on that exact source is run `38458982309` / verify `115508928348`, success. Letterhead creation, scanning, cropping, and new PDF generation stay removed. Saved letters and drafts stay readable, bound to the current session. Live Rules, Functions, billing, purge, and retention were not changed by that merge.

Play Internal testing was read again on 14 Oct 2026. The track is Active. Latest release is **26 (1.0.0)**, one version code, released 13 Oct 22:59, available to internal testers, not reviewed. Version 25 was replaced at that time. Visible history below 26 is 25, 24, 23, 22, 20, 19, 17, 15, 14, 13. No version code above 26 was on that page. Production is Inactive and has no release. The next unused code is **27**, now committed in `app.json`. versionCode 26 remains the Letterhead-containing AAB from `630655c` and the active Internal bundle. Do not upload it again. A billing-enabled build has not been started. Purchase-entry stays `0`.

App bundle explorer on 14 Oct 2026: 13 bundles. Highest is 26 (1.0.0), Active. The second page is 14, 13, and 10, all inactive. Production and open testing are inactive. Closed testing Alpha has no release. Internal history page 2 ends at version 10.

Play Console users: one account and no service account. `982505811909-compute@developer.gserviceaccount.com` is not invited, so that identity has no Play Android Publisher grant on this read. Monetisation setup has an empty RTDN topic and the enable control off. The form’s content choice is “Subscriptions and voided purchases only.” No test notification was sent. Licence testing has neither email list selected, Save is disabled, and the response is RESPOND_NORMALLY. No licence tester and no test payment instrument were confirmed. No purchase was started.

`GET` `https://asia-south1-vyaamikk-diary.cloudfunctions.net/androidRtdn` returned `405 Method Not Allowed`. KMS, encrypt/decrypt, and `BILLING_DIAG_UID_SECRET` were not read: Cloud Console stopped on the existing passkey block, the Firebase CLI login is expired, and `gcloud` has no account. Encryption was not bypassed. Admission stays off.

Canonical CI for the versionCode 27 client checkpoint is run `38479840244` / verify `115579459419`, success, on `ff408343a5da573bfcebe32ba6a03d07a45d22f9` (purchase-entry `0`). That run is not a purchase or a deployment.

The functions candidate is `09d01e60ac110fdf888b6e6f89aceb90e2848c43`. Its canonical CI is workflow_dispatch run `38528883464` / verify `115735676497`, success. The same SHA also passed pull-request run `38528854446` / verify `115735583069`. Neither run is a purchase or a deployment. This register sentence is a later docs note and is not the functions candidate.

`BILLING_DIAG_UID_SECRET` version 1 exists in Secret Manager. Its value was not printed. `roles/secretmanager.secretAccessor` on that secret is held by `982505811909-compute@developer.gserviceaccount.com`. After deploy from `09d01e60`, all five consumers report the binding `BILLING_DIAG_UID_SECRET` version `1` in `secretEnvironmentVariables`: `validateAndActivateAndroid`, `androidRtdn`, `scheduledBillingReconciliation`, `validateAndActivateIOS`, and `appStoreServerNotificationsV2`. The secret value is not a plain environment variable.

`scheduledBillingReconciliation` was deployed with `BILLING_RECONCILIATION_ENABLED=false`. That deploy did not run a cycle. The queue composites `_billingReconciliationQueue` `status`+`nextAttemptAt` and `status`+`leaseExpiresAt` are READY. Firestore rejected an explicit `_billingEventLedger` `monthKey`+`__name__` composite as unnecessary. The flag was then set to `true` on the serving revision, and scheduler job `firebase-schedule-scheduledBillingReconciliation-asia-south1` was run once. The log was `reconciliation_tick:0:0:0:0:0:0:0`, `stale_company:0:0:0:0:0`, and `commission_report:2026-10` with `complete:1`. The queue, company billing, and ledger collections were empty. The flag remains `true`, so later 5-minute runs also execute. This is not a purchase.

`play-rtdn-push@vyaamikk-diary.iam.gserviceaccount.com` exists. Cloud Run invoker on `androidrtdn` is that identity only. Anonymous GET and POST to both the `cloudfunctions.net` URL and the Cloud Run URL now return 403. A Pub/Sub push of an empty message, signed as that identity for audience `https://asia-south1-vyaamikk-diary.cloudfunctions.net/androidRtdn`, reached the handler and returned 400. That is authenticated invocation, not acceptance of a Play notification. Topic `play-rtdn-vyaamikk-diary` exists, the Play system publisher is granted `roles/pubsub.publisher` on that topic only, and push subscription `play-rtdn-vyaamikk-diary-push` points at the function. The Play Console topic field was not set, and real-time notifications were not enabled there.

Owner approval on 14 Oct 2026 enabled `cloudkms.googleapis.com` and `androidpublisher.googleapis.com`. Software key `projects/vyaamikk-diary/locations/asia-south1/keyRings/vyaamikk-billing/cryptoKeys/billing-purchase-credentials` is ENCRYPT_DECRYPT with its primary version ENABLED. Its only IAM binding is `roles/cloudkms.cryptoKeyEncrypterDecrypter` for `982505811909-compute@developer.gserviceaccount.com`. `BILLING_KMS_KEY_NAME` is that resource name on `validateandactivateandroid` revision `validateandactivateandroid-00003-pht`, `androidrtdn` revision `androidrtdn-00003-fgr`, and `scheduledbillingreconciliation` revision `scheduledbillingreconciliation-00004-7v6`. `PLAY_BILLING_ENABLED` is absent on all three. `BILLING_DIAG_UID_SECRET` remains bound. Reconciliation stays `false` on the two Android callables and `true` on the scheduler.

Play Console activity at 14 Oct 2026 14:52 records that runtime account as Active on `com.specialsoftwares.vyaamikkdiary`, with no access expiry, no account permissions, and no permission group. The app permissions added then are View financial data, Manage orders and subscriptions, View app information (read only), and View app quality information (read-only). The console requires the two read-only app-access permissions when an app is added. Admin, store listing, releases, catalog, and account permissions were not granted. This replaces the earlier read that the service account was not invited.

One Cloud Run job, `billing-runtime-preflight`, ran in `asia-south1` as that identity: one task, parallelism 1, max retries 0, timeout 120 seconds. Execution `billing-runtime-preflight-chdht` completed once with succeeded count 1. KMS encrypt and decrypt both returned HTTP 200, and the 32-byte values compared equal: `kms_round_trip=PASS`. A separate diagnostic Publisher GET for `preflight-synthetic-token` returned HTTP 401. The probe labeled that token request `androidpublisher`; that label is not a scope field from the metadata response. That 401 is not purchase verification, and it is not the API-access result a fake-token 404 would be. The job and that execution were then deleted. The billing key, diagnostic secret, RTDN topic, push subscription, and reconciliation scheduler were kept. This register note is not the functions candidate. The Play Console RTDN topic field is still empty and real-time notifications are still off.

A follow-up job, `billing-publisher-diagnostic`, ran once as the same identity. Execution `billing-publisher-diagnostic-ldnlb` had one task, no retries, and a 120-second timeout. It made no KMS call. The metadata response had `token_type=Bearer`, `expires_in=1799`, and `token_present=true`, and it did not include a `scope` field. The same synthetic subscription read returned HTTP 401 with `error.reason=permissionDenied` and `error.domain=androidpublisher`. `error.status` was absent. No token, header, body, or error message was logged. The job and that execution were deleted. This is Play's permission denial, not purchase verification and not a fake-token 404. The token's OAuth scope remains unverified. `PLAY_BILLING_ENABLED` stays absent. This note is not the functions candidate.

Before any owned purchase, an unused draft, an unused secret binding, and an unused RTDN subscription can be removed. After any purchase, keep KMS decrypt, this secret binding, and already-owned RTDN and reconciliation. Stop new admission by leaving `PLAY_BILLING_ENABLED` unset and the UID allowlist empty.

License-tester selection stays before purchase admission. No tester list is selected. No device test instrument has been confirmed. No purchase is started. Catalog creation, base-plan activation, function deploy, Internal upload, and `PLAY_BILLING_ENABLED=true` are not part of this source change.

## App reliability candidate — 14 Oct 2026

No phone was attached (`adb devices` empty), so the installed version was not re-read. The last Play Internal read remains versionCode 26 (1.0.0). This pass did not build or upload. Functions runtime remains the `09d01e60` deploy. KMS PASS is unchanged and was not repeated. Publisher HTTP 401 `permissionDenied` / `androidpublisher` is unchanged and was not repeated. The token response still has no recorded `scope` field.

| Issue | Workstream | Evidence | Next action | Dependency | Status |
|---|---|---|---|---|---|
| Startup stuck on the logo | App startup | SOURCE. Exit animation was the only unlock after the hold timer cleared. A 12s reveal now shows recovery without cancelling the in-flight coordinator, and a resolved destination navigates without waiting for that animation. | Cold launch on a phone | Owner build choice | Corrected in source |
| Map freeze and missing-key fallback | Calendar / Map | SOURCE. The missing-key branch does not import `MapView`. Marker work does not start unless a native map may mount. Customer copy and Back to Calendar are in the fallback. No overlapping text was found in that mounted tree. | Phone: missing-key interaction, then tiles only if a key is later configured | Maps configuration unchanged | Corrected in source |
| You footer over At a glance | Dashboard layout | SOURCE. The footer repeated the overlaying tab-bar height as internal padding. It now lifts once by the measured bar height. | Phone at normal and large font | None | Corrected in source |
| Publisher denial | Billing | LIVE BACKEND, retained. HTTP 401, `permissionDenied`, domain `androidpublisher`. Metadata `scope` was not returned. | Do not repeat that probe | A different check needs its own approval | Unresolved |
| Catalog, licence testers, Play RTDN | Billing | Last Play read: no products, no tester list, RTDN topic field empty. Source prices match the nine established SKUs. GRIN is not a separate product. | Owner decision before any Play catalog or tester change | Publisher access still denied | Not started |
| Purchase entry | Billing client | `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` is `0` on preview, production, and internal-grin. `PLAY_BILLING_ENABLED` is absent. Empty allowlist denies new admission. | Keep closed until a restricted-billing build is chosen | Build choice | Closed |

Local checks for this source pass: `tsc --noEmit`, i18n key consistency, boot completion, boot production startup, boot-screen integration, tab-bar metrics, and the app-reliability contract. Those are SOURCE / EXTRACTED_RUNTIME / MOUNTED_REACT_INERT_NATIVE, not a native-device or Play-purchase result. Canonical CI run `38581343830` on `b3d46a6` failed `test:boot-screen-integration` because a resolved destination routed before database readiness could be withdrawn. The animation fallback now uses the existing completion path, which still refuses that route. Replacement canonical CI is run `38583297726` / verify `115918562795`, success, on `6499d207c795bce492fec20b44a18e07bef6fd0f`. That run is not a purchase, a deployment, or a phone install. This sentence records that run and is not itself the candidate. No EAS build was started.

The subscription catalog and one-time products pages had no products. Play prices for `vyd_starter`, `vyd_professional`, and `vyd_business` are UNKNOWN. License testing has no email list selected and the license response is RESPOND_NORMALLY, so a purchase now would not be a free license test. No purchase was attempted. BillDesk KYC is in progress and stopped at an OTP screen. The OTP was not generated and the APK-URL question was not emailed.

Play new-purchase admission is now separate from already-owned lifecycle in source `e494f278` (integration merge `eb4c05d`). `PLAY_BILLING_ENABLED` still defaults off and still blocks a first bind. RTDN, reconciliation, refunds, and entitlement correction for a token the account already owns are no longer stopped by that flag. This is not deployed. A new-grant notification while admission is closed returns HTTP 503 and is not treated as delivered.

The closed purchase entry now asks `getPlayPurchaseAdmission` and opens a sheet only for `{ purchaseAllowed: true }` on the current process session. The purchase-entry and quota-upsell flags stay 0. The callable returns that boolean only, is not deployed, and is false while Play billing is off or the UID list is empty. A missing callable stays closed. Run `38474101283` on `428ecf5` failed on a duplicate import. Replacement canonical CI is run `38474707921` / verify `115562444583`, success, on application source `ff838e75c799cc93a77d5f368de0408039f9ebed`. That run is SOURCE and INJECTED coverage, not a Play purchase. The Letterhead run `38458982309` does not cover this billing change.

The earlier note that versionCode 26 was absent and that draft 14 was the open upload is historical. The 14 Oct read above replaces it.

Maps unavailable in vc26; missing-key fallback test only. The Cloud passkey was not retried, and Maps credentials were not changed.

Inventory and the compatibility boundary: `docs/release/LETTERHEAD_REMOVAL.md`.

## Internal release in progress — 2026-10-13

Play bundle explorer, 12 versions, read before this commit: **25 Active**; 24, 23, 22, 20, 19, 17, 16, 15, 14, 13, 10 Inactive. Absent: 11, 12, 18, 21, and every code above 25. Next in-place code is **26**.

Play App Signing SHA-1, copied from the App signing key control: `D2:23:F0:A5:EF:FD:8E:2E:42:17:52:D3:5A:D7:A0:0E:19:F8:2E:59`. That matches the previously unmatched Firebase SHA-1 `d223f0a5…`. The upload certificate was not used.

`GOOGLE_MAPS_ANDROID_API_KEY` is not in the EAS production environment, and `eas secret:list` is empty. Google Cloud credentials could not be opened (passkey, too many failed attempts). The Firebase web key was not narrowed. No Maps credential was created or restricted, and Maps billing was not enabled. This build keeps the existing resolver: without that secret, `MapView` stays unmounted.

| Item | Value |
|---|---|
| **Build commit** | `630655c49c12dd70d6862885b72f384d44509f99`. CI **`38427649492` SUCCESS** / verify **`115401157113`**. |
| **EAS** | `e154edd3-2e95-47bf-8945-ff4b56521ade` FINISHED. Profile `internal-grin`. No auto-submit. versionName `1.0.0`, versionCode **26**. Purchase entry and quota upsell `0`. |
| **AAB SHA-256** | `bf9885fc2086b6841fcd3a0731c0766de272288e5959b6eccbb9b6cc6cba7ac9`. Upload certificate SHA-256 matches the established upload key. Manifest has no Maps API key. Updates `ENABLED=false`. |
| **Internal upload** | Not completed. versionCode 26 was still absent. Draft release 14 is open. Do not rebuild. |

## Work board — CLOSED 2026-10-13 (no further security or architecture review)

Closed against CI-tested source `c8cdbc55933864e474cef4593bc522ca8570af7a`. Docs tip `da4b004` only records that run. Agent 5 stopped at its model limit. The coordinator ran the flipped QA tests. That is coordinator review, not an independent QA pass.

| Stream | Disposition |
|---|---|
| A1 GRIN form / return | **Completed and integrated.** Completed-form lock, existing-command retry, account-switch unmount, and confirmed-balance refresh are in `c8cdbc5`. Device TalkBack and a live multi-line return remain **device/live pending**. |
| A2 files / uploads / documents | **Completed and integrated** for PDF escaping, ZIP names/hashes, and renderer JavaScript. Letterhead gallery, scanner, and Print on a phone are **device pending**. Storage-object retention after record deletion was a policy choice, not a code fix. |
| A3 session / logging / SDK | **Completed and integrated** for clearing the Crashlytics user id on opt-out. App Check stays uninitialized on purpose. Live App Check enforcement is **not applicable** until a separate decision. |
| A4 dependencies / Android | **Functions query-parser refresh is integrated** on `53cfe41` (express 4.22.3, body-parser 1.20.8, qs 6.16.0, side-channel 1.1.1). Canonical CI **`38294284394` SUCCESS** / verify **`114961527836`**. Other advisories were not refreshed and are not called harmless. PreviewActivity removal is still source-only until the next AAB. Installed Internal remains `7c938f8` / vc24. |
| A5 QA | **Not an independent QA pass.** Coordinator review only. |

Historical assignment table (unchanged as the record of who owned what):

## Work board — 2026-10-12 parallel execution (historical)

Coordinator: this session, worktree `grin-combined` (`feature/unified-material-movement-aso`). Only the coordinator integrates into the candidate and edits `package.json`, lockfiles, `app.json`, `eas.json`, plugins, workflows and this register. Base for all agent worktrees: **`a528de015f05fc7e3f2ea777a6a5a3c8434abc7d`** (application source `a67e716`; CI `38232385275` on `4aea1b3`).

| Assignment / agent | Worktree · branch | Owned files | Finding → reproduction → correction | Dependencies / evidence | Integration |
|---|---|---|---|---|---|
| A1 PR #33 completed-form | `sec-a1-pr33-form` · `fix/pr33-completed-form` | `src/screens/grin/**`, `src/services/grin/repository/**`, `tools/grin-interop/**`, `grin.*` locale keys | Completed create/return stayed closed until an explicit new intent (`07acd92`, `8c3c8a8`). Remaining gaps closed on this candidate: account switch must hide the previous form, and a new return must reload the confirmed balance | Joined host test `grinUiLifecycle.mount.test.ts` (SQLITE_HOST + INJECTED + MOUNTED_INERT). Completed-form, retry, lost-response, multi-line, and owner-isolation regressions rerun locally | INTEGRATED. Coordinator review only. Not an A5 sign-off |
| A2 files / uploads / documents | `sec-a2-files` · `security/files-uploads-documents` | `src/services/letterhead/**`, `storage/**`, `pdf/**`, `share/**`, `src/utils/share.ts`, `src/services/grin/export/**`, renderer | PDF escaping, ZIP entry names and supplied-byte hash, renderer JS disabled. Not reopened | Host fixture tests already on `4bf36e6` | INTEGRATED. No new reproduction |
| A3 session / logging / SDK | `sec-a3-session-logging` · `security/session-logging-sdk` | `src/utils/logger.ts`, `safeDiagnostics.ts`, `src/services/telemetry/**`, `src/services/appCheck/**`, auth flows | Crashlytics user id cleared on opt-out. App Check stays uninitialized. Not reopened | Sentinel privacy test on `4bf36e6` | INTEGRATED. No new reproduction |
| A4 deps / Android / links | `sec-a4-deps-android` · `security/deps-android-links` | plugins, advisory triage | PreviewActivity removal plugin is registered for the next build (CONFIG_PLUGIN_SOURCE). Lockfile refreshes were not applied. Not reopened | `test:android-manifest-hardening` on `4bf36e6`. Installed Internal AAB is still `7c938f8` / vc24 | INTEGRATED as source. Merged-manifest proof waits for the next AAB |
| A5 independent QA | `sec-a5-qa` · `qa/pr33-security-review` | `tools/qa/**` only | Agent 5 stopped at its model limit while reviewing. That is not an independent QA pass. The coordinator ran the flipped completed-form and retry-wedge tests and wired them into `test:grin-interop` | Those tests passed again on this candidate with the UI lifecycle corrections | NOT A QA PASS |

Integration rule: small dependency-ordered batches onto the candidate; affected suites rerun on the integrated tree; canonical `ci:verify` on the final application candidate. Separate green worktrees are not proof of the combined tree.

## Current state (authoritative — 2026-10-13 executable packet)

Executable steps, hashes, rollback limits, and the owner payment list are in
`docs/release/packets/EXECUTABLE_INTERNAL_RELEASE_2026-10-13.md`.

| Item | Current value |
|---|---|
| **Dependency source** | **`53cfe412d7c62aaf6b5bfe379f6cc39cfeeed631`**. Lockfile sha256 `f5ebda2224b089915161f89192516011d4d9f03d200308f2c553c59adb11228d`. Prepared Functions tree content sha256 `9d1f7a7b057814618b5f376995897affd162160dfb57de9c72e08c46f5481be2`. Platform archive **PENDING** (no deploy). |
| **Canonical CI** | Run **`38294284394` SUCCESS**, verify **`114961527836`** (20m15s), on **`53cfe41`**. Prior SUCCESS **`38269047797`** / verify **`114878446537`** remains on **`c8cdbc5`** only. |
| **Merge operation, not performed** | PR **#33** head into **`integration/grin-g1-g5-source`** (`1be1daed`). Not `main`. Not `c8cdbc5` alone. The head at this writing is `53cfe41`; a later docs commit on the same pull request is included only if it is the head at approval time. |
| **Live Functions inspect** | **NOT RUN** today. Firebase credentials need `firebase login --reauth`. Do not treat the seven functions as absent. |
| **Rollback** | `540e07a` is not a compatible rollback after clients that send `unknown` provenance are installed. Safe disablement is PATCH `GRIN_GOODS_EVIDENCE_FUNCTIONS=false` on the seven names. Do not delete queued commands or originals. |
| **versionCode** | Source and uploaded Internal remain **24**. Next code **PENDING** a fresh Play inventory. |
| **Billing** | Next Internal build stays billing-off. Console catalog, license testers, RTDN, and the purchase flow were **NOT RUN**. |

## Prior current state (2026-10-12 PR #33 UI lifecycle)

| Item | Current value |
|---|---|
| Repo / branch / PR | `specialsoftwares/vyaamikk-diary` · integration base **`integration/grin-g1-g5-source`** · application branch **`feature/unified-material-movement-aso`** · open PR **#33** (**do not merge**) |
| **Reviewed checkpoint** | **`4bf36e61a29a84e01257f82f1930ddd00b4e53c0`**. GHA **`38260379247` SUCCESS** / verify **`114849062990`**. That run is the parent of the UI lifecycle corrections. Prior SUCCESS **`38232385275`** / verify **`114754746890`** remains on **`4aea1b3`** (application `a67e716`) only. |
| **Reviewer** | Coordinator. Agent 5 stopped at its model limit and did **not** complete an independent QA pass. |
| **Account switch** | `GrinAdmissionGate` passes `user.uid` into `GrinAdmittedSessionHost`. The host renders no admitted child while the live token and the sqlite session disagree, so create and return bodies unmount on A→B, on logout, and on the next login. A joined test shows the previous supplier, GSTIN, invoice, material, reason and quantities are not displayed. Old Save, Start new, and completion callbacks do not write, rearm, or navigate. |
| **New return** | After confirmation, Start new return rechecks the frozen uid and session generation, reloads the record, confirmed projection and eligibility, and mints a new intent only when that projection already contains the confirmed return quantities. Otherwise Save stays closed and a retry is offered. Quantities and the displayed version come from the reloaded projection. |
| **Local proof (not CI)** | `grinUiLifecycle.mount.test.ts` plus the completed-form flight test, the three `tools/qa` regressions, `f2-multiline-return-sequence`, `f2-multiline-return-transient-retry`, and `grinLocaleKeys` (324 keys × 5). Boundaries: **SQLITE_HOST**, **INJECTED_PORT**, **MOUNTED_INERT**. **NATIVE_DEVICE** not claimed. **FIRESTORE_EMULATOR** not re-run for this correction. |
| **Candidate SHA** | CI-tested tip **`c8cdbc55933864e474cef4593bc522ca8570af7a`** (UI lifecycle **`340dfee`** plus the `mutate` type narrowing). A later docs commit only records this run id. |
| **Combined-tree CI** | GHA **`38269047797` SUCCESS** / verify **`114878446537`** on **`c8cdbc5`**. Parent **`38260379247` SUCCESS** / verify **`114849062990`** on **`4bf36e6`**. GHA **`38268460136`** / verify **`114876528044`** FAILED on **`340dfee`** (`tsc` on optional `server.mutate`) and is not the candidate. |
| **Security** | Accepted file, telemetry, and Android-plugin corrections stay as integrated on `4bf36e6`. Not reopened. Lockfile refresh, FileProvider merged-manifest proof, App Check enforcement, and Storage object retention remain out of scope. |
| **Backend compatibility dependency** | Unchanged and **not deployed.** Live Functions will reject `captureProvenance: "unknown"` until redeployed. |
| **Device pending** | Native Expo upload, ML Kit scanner, expo-print; MM create/return TalkBack; multi-line return confirmation on device; Play upgrade path. Host reopen is not process-death proof. The PreviewActivity plugin is source-only until the next AAB is dumped. |
| **Play / EAS artifact (unchanged)** | Installed/uploaded Internal remains **`7c938f8` / vc24** · EAS **`c931da3d-…`** — **this source candidate is not that AAB** |
| HOLDs | No main merge, PR **#33** merge, billing, purge, Functions deploy, EAS/OTA, Play writes, website publish. |

### UI lifecycle evidence (local, on top of `4bf36e6`)

| Finding | Before | After |
|---|---|---|
| Account switch | Zero writes were proved. The completed-form early return skipped the session check, so a body that stayed mounted kept private fields on screen. | `GrinAdmittedSessionHost` renders no admitted child while the live token and sqlite session disagree, so the production create and return bodies unmount. Joined test: completed create A→B, completed resumed return A→B, logout then a new generation, and a return response that arrives after the switch. Previous supplier, GSTIN, invoice, material, reason and quantities are absent. Old Save, Start new, and completion callbacks add no commands and do not navigate. `grinUiLifecycle.mount.test.ts` |
| New return balance | Start new return cleared the form without reloading the confirmed projection, so the next return could still show the pre-return available quantity. | Start new return reloads the authorized record, projection and eligibility. Receive 10, confirm a return of 4, stay mounted, start another return: display 6 remaining, empty reason and quantity, confirmed version 2. The second return uses a new command id. A projection that does not yet contain the return keeps Save closed and offers a retry. |

## Prior (authoritative — 2026-10-12 PR #33 final functional corrections)

| Item | Current value |
|---|---|
| Repo / branch / PR | `specialsoftwares/vyaamikk-diary` · integration base **`integration/grin-g1-g5-source`** · application branch **`feature/unified-material-movement-aso`** · open PR **#33** (**do not merge**) |
| **Candidate SHA** | CI-tested tip **`4aea1b30e1400b84bc2830dc891d46c5528506f2`** (register on application **`a67e7169e1238e0d68e699a7a99c809e2caafc29`**). Parent docs tip **`238712e`**. A later docs commit only records the run id and does not change application source. Prior CI-tested application **`cb854f71e8ca1873fcddd231317bfd9a137729f1`** remains the reviewed base for arrival/provenance, eligibility, quota, ownership, and letterhead. |
| **Submission lock** | Duplicate prevention is one submission intent plus owner, ledger, and session generation. A completed intent stays completed. The next receipt or return mints a new intent after the current turn (`queueMicrotask`), not on every rerender. |
| **Multi-line return** | `dispatchReturnSequence` calls `outbox.dispatchDue` between lines. No test-supplied drain. The next line uses the confirmed `eventVersion`. Versions are never invented locally. `continueReturnPlan` resumes a saved plan after reopen. |
| **Interrupted return** | Reopen restores reason, selected quantities, and per-line status. A quantity edit does not replace a submitted `commandId`. Unfinished lines omitted from a new pick stay in the plan. A different intent while a plan is uncertain throws `return_intent_open`. |
| **Local proof (not CI)** | `npm run test:grin-product` and `npm run test:grin-interop` passed on `a67e716`. Boundaries: **SQLITE_HOST**, **INJECTED_PORT**, **MOUNTED_INERT**. **NATIVE_DEVICE** not claimed. |
| **Emulator proof (local)** | `f2-multiline-return.firestoreEmulator.test.ts` via `GoodsEvidenceRegisterAdapter` + SQLite/outbox + production `dispatchReturnSequence` (lost response reconciled, then the second line, then a later intent). Label **FIRESTORE_EMULATOR** + **SQLITE_HOST**. Hooked into `test:goods-evidence-g1-emulator`. Not **NATIVE_DEVICE**. |
| **Combined-tree CI** | GHA **`38232385275` SUCCESS** / verify **`114754746890`** on **`4aea1b30e1400b84bc2830dc891d46c5528506f2`** (workflow_dispatch). Application **`a67e716`**. Prior SUCCESS **`37739285157`** / verify **`113186002492`** remains on **`cb854f7`** only. |
| **Backend compatibility dependency** | Unchanged and **not deployed.** Packaged Functions accept `captureProvenance: "unknown"` and optional `reportedArrivalPrecision`. Live Functions will reject `unknown` provenance until redeployed. |
| **Device pending** | Native Expo upload, ML Kit scanner, expo-print; MM create/return TalkBack; multi-line return confirmation on device; Play upgrade path. Host reopen is not process-death proof. |
| **Play / EAS artifact (unchanged)** | Installed/uploaded Internal remains **`7c938f8` / vc24** · EAS **`c931da3d-…`** — **this source candidate is not that AAB** |
| HOLDs | No main merge, PR **#33** merge, billing, purge, Functions deploy, EAS/OTA, Play writes, website publish. |

### PR #33 final correction evidence (local, `a67e716`)

| Finding | Proof |
|---|---|
| 1 Submission-lock lifecycle | Mounted create: immediate double-submit writes one command; the next intent writes a second; the completed callback does not; an old callback after account change writes nothing. `grinReturnCreate.flight.mount.test.ts` |
| 2 Production multi-line confirmation | One `dispatchReturnSequence` confirms two lines through the repository's own `dispatchDue`. SQLite/INJECTED: `f2-multiline-return-sequence.sqliteHost.test.ts`. Firestore emulator adapter: `f2-multiline-return.firestoreEmulator.test.ts` |
| 3 Interrupted return | Reopen restores reason and quantities on the mounted return screen. Resume keeps `commandId`s. Quantity edit sets `quantity_edit_blocked` and keeps the frozen quantity. Omitted unfinished lines remain. Lost response reconciles to `issued` and the next line continues. A later intent can return against the same receipt. |

## Prior (authoritative — 2026-10-08 PR #33 functional corrections)

| Item | Current value |
|---|---|
| Repo / branch / PR | `specialsoftwares/vyaamikk-diary` · integration base **`integration/grin-g1-g5-source`** · application branch **`feature/unified-material-movement-aso`** · open PR **#33** |
| **Candidate SHA** | Tip **`77ae4a9`** (register) · CI-tested application **`cb854f71e8ca1873fcddd231317bfd9a137729f1`** (packaging fix on **`3d19d7f`**) · docs clarification **`238712e`** |
| **Reviewed application base** | **`56837f17fb7d4354120282841fbcd6faf71c1bf5`** (prior combined-tree CI **`37699830269`**) · prior docs head **`c708649`** |
| **Included source** | Letterhead repair preserved + MM corrections: durable multi-line return sequence (queue≠confirm; confirmed.eventVersion refresh; stable commandIds; partial retry); sync create/return flight; truthful arrival precision + `CaptureProvenance.unknown`; return eligibility/summary; client-flag≠backend-admission claims |
| **Letterhead merge parents** | `1f302b9` + `b274fe8` → merge **`1be1daedc67f4ef59f579a92c1b7262d1af5904c`** |
| **Letterhead CI-tested SHA** | **`eccc783`** · GHA **`37693886315`** / verify **`113040537404`** SUCCESS (branch only — not combined-tree proof) |
| **Combined-tree CI** | GHA **`37739285157` SUCCESS** / verify **`113186002492`** on tip **`cb854f7`** (workflow_dispatch). Prior SUCCESS **`37699830269`** covers review base **`56837f1`** only. |
| **Backend compatibility dependency** | Source+packaged Functions accept `captureProvenance: "unknown"` and optional `reportedArrivalPrecision` (`unknown`\|`date`\|`instant`; date stores YYYY-MM-DD). **Not deployed.** Existing live backend will reject `unknown` provenance until Functions are redeployed. Do not claim live backend already supports it. |
| **Device pending** | Native Expo upload, ML Kit scanner, expo-print; MM create/return TalkBack; multi-line return confirmation UX on device; Play upgrade path |
| **Play / EAS artifact (unchanged)** | Installed/uploaded Internal remains **`7c938f8` / vc24** · EAS **`c931da3d-…`** — **this source candidate is not that AAB** |
| HOLDs | No main merge, PR **#33** merge, billing, purge, Functions deploy, EAS/OTA, Play writes, website publish from this instruction. |

### PR #33 correction evidence (local)

| Finding | Before | After / proof |
|---|---|---|
| 1 Multi-line returns | Sync loop froze one `expectedVersion`; “ok” meant queued | `dispatchReturnSequence` + `grinReturnPlan`; confirm-between-lines via drain; `f2-multiline-return-sequence.sqliteHost.test.ts` |
| 2 Partial retry / duplicates | Retry re-queued L1; React busy only | Stable `commandId`s; sync `grinMutationFlight`; flight mount + interop partial retry asserts write counts |
| 3 Arrival / provenance | Noon IST fiction; invalid dates; offline default | Calendar validation; `reportedArrivalPrecision`; `captureProvenance: unknown`; Functions copies updated (**deploy pending**) |
| 4 Return summary / eligibility | Combined pendingOrReturned; auto-reselect; empty+error | Separated confirmed/pending/available; eligibility API; selection retention; localized statuses |
| 5 Claims / coverage | Flag≡admission wording | Destinations comments/tests; mounted+joined coverage; letterhead tests preserved |

## Prior (authoritative — 2026-10-08 source candidate after Letterhead merge)

| Item | Current value |
|---|---|
| Combined-tree CI on review base | GHA **`37699830269` SUCCESS** / verify **`113060362670`** on **`56837f1`** · docs **`c708649`** |
| Backend note (superseded for unknown/precision) | ArrivalObservation / unknown provenance were deferred; now implemented in source with deploy dependency above. |

## Prior pin (authoritative — 2026-10-07 B2 vc24 Internal) — artifact identity only

| Item | Current value |
|---|---|
| Repo / branch / PR | `specialsoftwares/vyaamikk-diary` `integration/grin-g1-g5-source` draft **#31** (historical pin context) |
| **Play Internal Active** | **`7c938f8` / vc24** — release **24 (1.0.0)** Available to internal testers · Released **7 Oct 20:30** · Not reviewed. GRIN Functions previously deployed/enabled — this upload did **not** redeploy them. |
| **B1 application SHA** | **`7c938f836891411752e6fa6af8879ddfe275ab60`** — vc24 + renderer CI `PUPPETEER_SKIP_DOWNLOAD` for separate Node 22 container. Parent `13da527`. NARROW preserved. |
| **Matching CI (application)** | GHA **`37616692491` SUCCESS** / job **`112776635103`** on **`7c938f8`**. `test:all` 161/161; `ci:verify PASS`; CI log shows `PUPPETEER_SKIP_DOWNLOAD=true`. |
| **EAS B1 (COMPLETE)** | Build **`c931da3d-4dcb-472e-9c63-f72217c6d95c`** FINISHED — profile `internal-grin`, STORE AAB, no auto-submit. AAB SHA-256 `dbda921d…bfd43d`; package `com.specialsoftwares.vyaamikkdiary` **1.0.0 / 24**; upload-key SHA-256 **MATCH** established key. Archive under access-controlled `vyd-private` (not public repo). |
| **B2 (COMPLETE)** | Uploaded verified AAB only to existing Internal Testing track. Tester lists unchanged. Join link `https://play.google.com/apps/internaltest/4699683181760265777`. Production / open / closed not modified. |
| Customer UX (in AAB) | GRIN under Material Movement when admitted; arrival cancel fix; basic goods-received + Saved Records preserved. |
| Dependency residuals | `extract-zip@2.0.1` / `image-size@1.2.1` **open** (mitigated for this Internal build; not patched/removed). Retained for public-release review. |
| Device D1 | Owner: Play upgrade over installed **vc23** → **vc24** — **no** uninstall / clear / OTP loops. PLAY_INSTALLED evidence pending. |
| HOLDs | No billing / purge / Functions deploy / main / public / OTA from this instruction. Upload ≠ device acceptance. |

---

## Prior (2026-10-07 correction closeout — superseded for B1 pin)

Correction tip **`6150c5b`** / CI **`37603081878`**. Succeeded by application freeze **`7c938f8`** + EAS B1 above. Installed Play pin remained **vc23**.

---

## Current state (authoritative — 2026-10-06)

Single table. Later team reports under this file are **historical evidence**.
If they still say “unapplied pin”, “unpushed”, or “canonical CI pending”
for `520f9f9` / `0d7aa17`, those lines are **superseded** for that SHA.
Do not rewrite those files as if they were re-run today.
**2026-10-07 addendum above** records source successor `a31bcf2` without changing
installed Internal **`540e07a` / vc23**.

| Item | Current value |
|---|---|
| Repo / branch / PR | `specialsoftwares/vyaamikk-diary` `integration/grin-g1-g5-source` draft **#31** (no duplicate; auto-merge off) |
| **CI-tested PR head** | GHA **`37445383607` SUCCESS**, job **`112208918347` `verify`**. Checkout **`7e0d629023198333ed384ae076285925e98047d6`**. Parent **`d4c7ed4`**. Application blobs **= `540e07a`**. Prior success `37440328976` covers `fcda7cd` / `70bdfe4` only. |
| **Current application SHA** | **`540e07aa07f376716484adb879ce66cb9fb170ce`** (P8 inert purge path on `60c4bc1` billing lifecycle). Flag **`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`**. Purchase-entry **`"0"`**. **Do not advertise GiB.** |
| **Selected Internal candidate** | **`540e07a`**. T5 SOURCE+INJECTED **PASS** (`b3b1c97`). Matching CI **SUCCESS**. Do not build `60c4bc1` / `fcda7cd` / `520f9f9` / `56f2040` / `313025f` alone. B1≠B2 **neither granted**. |
| Helper `PINNED_APP_SHA` | **`540e07aa07f376716484adb879ce66cb9fb170ce`** — **applied**. Live mode still rejects `GRIN_OPS_PINNED_SHA`. A3 **not executed**. |
| **Tooling SHA** | **`2d33f6d252d66a89d6fcef5cf75feaf268e7e7b2`** — helper `PINNED_APP_SHA` only. **Separate from** application `540e07a`. Ops-guard **34/34**. Historical `228a8f5` / `0d7aa17` remain history. |
| Historical ops-guard baseline | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` **34/34**. Re-run after this pin: **34/34**. Live mode still rejects `GRIN_OPS_PINNED_SHA`. UNKNOWN inventory still refuses mutate. |
| **Canonical CI** | GHA **`37445383607` SUCCESS** on `7e0d629` / app **`540e07a`**. Job `112208918347`. |
| S1 / S2 | **Closed** at SOURCE / INJECTED / named G2 EMULATOR (`127.0.0.1:8091` / `9200`, `demo-vyaamikk-grin-g2`). Not reopened (no new reproduction). Not live. Not device. |
| P3 | **ACCEPTED**. Coordinator re-ran `quota.injected.unit.test.ts` **PASS** after `313025f`. |
| P8 | **OPEN / FAIL** (flag **false**; GRIN omitted from default purge). Production-path packet + inert wiring landed (`540e07a`). Later grant = one-line flip. **Not flipped. Not live.** GRIN **synthetic-only**. |
| Owner storage (2026-10-06) | **1 / 3 / 10 GiB wired** as `OWNER_SELECTED_STORAGE_CAPS_BYTES`. Historical 1/5/20 and 256 MiB/1/5 named, not live. **Do not advertise.** |
| Owner deletion (2026-10-06) | **45-day** grace wired (`DELETION_GRACE_DAYS=45`). Supersedes 180. Play freeze ≠ delete. GRIN purge flag **false**. |
| Device / live backend / billing / public | **Not accepted** |
| Next approval | A–F in `CONSOLIDATED_PILOT_PACKET.md`. **Not executed.** Owner has not lettered live ops. P8 live flip **separate**. |
| Device named | OnePlus 12R, Android 16, vc22 installed, available today. **Upgrade device.** Clean-install device **unnamed**. Owner Firebase UID **received privately (out-of-repo)**. Values **not in git**. Admission **writes HOLD**. |
| versionCode | **23 UNRESERVED**. Play explorer 2026-10-06: highest uploaded **vc22**. |
| Merge-base / `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |

Do not cherry-pick `0cd3473` / `520f9f9` / `2cebe32` / `ad72d79` again. Do not force-push
divergent team branches. Do not reopen ops-guard A/B without a new
reproduction. Do not reopen S1/S2 without a new reproduction.

---

## Today execution board (2026-10-06)

| Item | Owner | Next action | Dependency | Evidence | Blocker |
|---|---|---|---|---|---|
| Wire 1/3/10 GiB + 45-day grace | T2 | **Landed** combined `313025f` (`ad72d79`) | done | coordinator tests PASS | do not advertise; P8 still FAIL |
| Canonical CI on selected SHA | coordinator | GHA **`37445383607` SUCCESS** job `112208918347` on `7e0d629` / app **`540e07a`** | done | public API | — |
| Pin helper to selected SHA | coordinator apply | **Applied** `PINNED_APP_SHA=540e07a`. Ops-guard **34/34** | T5 PASS + CI SUCCESS | TOOLING 34/34 | A3 not executed |
| Consolidated backend packet | T1 | **Landed** `a28bfb0`. C names **`540e07a`**. Pin HOLD until CI SUCCESS | owner letter of complete batch | inspect 2026-10-06 | A6 UNPROVEN; no live execute |
| Internal AAB packet | T3 | **Landed** `PHONE_HANDOFF.md` `c200712`. B1 checkout **`540e07a`**. Recheck Play before B1 | owner B1 letter | OnePlus 12R named | B1 ungranted |
| Restricted billing packet | T4 | **Landed** in `60c4bc1`. T5 SOURCE+INJECTED **PASS** `c69ffb9`. Catalog **NOT RUN** | pin of `540e07a` after CI | FakePlay nine cases | activation HOLD |
| P8 production path | T2 | **Landed** packet `b08690d` + inert wiring `540e07a`. Flag **false** | owner live grant later | `grinCleanup` + `deletion.unit` PASS | do not flip; synthetic-only |
| Phone acceptance | T3 + owner | vc22 upgrade after B2 | AAB + private UID on file | device **NOT RUN** | no AAB; D writes HOLD |
| Review `60c4bc1` lifecycle | T5 | **Landed** `REVIEW_60c4bc1.md` `c69ffb9`. SOURCE+INJECTED **PASS** | done | FakePlay nine cases | leftover P3-FAIL stay dirty |
| Review `540e07a` P8 wiring | T5 | **Landed** `REVIEW_540e07a.md` `b3b1c97`. SOURCE+INJECTED **PASS**. P8 **FAIL** operationally | done | `grinCleanup` + `deletion.unit` | leftover P3-FAIL stay dirty |

---

## Readiness

| Gate | State |
|---|---|
| SOURCE READY | Application **`540e07a`**. T5 SOURCE+INJECTED **PASS** (`b3b1c97`). GHA **`37445383607` SUCCESS** on `7e0d629`. Helper pin **applied**. **P8 FAIL** (flag false). |
| BACKEND PILOT READY | A–F packet present. **Not executed.** A/B YES on paper. C pin applied, live HOLD. D `count=1` writes HOLD. E SOURCE/STUB procedure (`E_ENABLE_DISABLE.md`); LIVE HOLD. F INJECTED YES / LIVE HOLD. |
| INTERNAL BUILD READY | T3 `PHONE_HANDOFF.md`. B1 of **`540e07a`** after owner letter. B1≠B2 **neither granted**. Not a purchase-test build. Recheck Play before B1. |
| DEVICE ACCEPTED | **NOT RUN**. OnePlus 12R available today — not yet executed. |
| BILLING ACCEPTED | Lifecycle SOURCE+INJECTED **PASS** at `60c4bc1` (`c69ffb9`); catalog **NOT RUN**; purchases **off**; REAL-CHARGE **not run** |
| PUBLIC SUBMISSION READY | Blocked on wired 1/3/10+45d, device, billing, listing. Owner writes recorded. |
| PUBLIC ROLLOUT APPROVED | Not authorized |

---

## Live preflight (refreshed 2026-10-06 this session)

Read-only `grin-functions-op.mjs inspect` (no mutation, no export overwrite).
Inventory **complete**: HTTP 200, `pages=1`, `reason=ok`.

| Check | Result |
|---|---|
| Project | `vyaamikk-diary` / `982505811909` (HTTP 200) |
| Bucket | `vyaamikk-diary.firebasestorage.app` belongs (HTTP 200) |
| GRIN seven | **ABSENT** (complete inventory; not an error/empty fixture) |
| Unrelated asia-south1 functions | **39** (identity/email/deletion/billing) |
| Runtime SA | `982505811909-compute@developer.gserviceaccount.com` **`roles/editor`** |
| Editor residual | Broad privilege **exists**. Not granting a delete role does not remove it. Do not change this shared account. |
| Firestore DB IAM | HTTP **501** unsupported/unknown |
| Firestore sha256 | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` = baseline |
| Storage sha256 | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` = baseline |
| Rollback bytes | `docs/release/rules-compat/live-export-2026-10-06/` |

Billing callables are among the 39. This session: those handlers are
**ACTIVE**; `PLAY_BILLING_ENABLED` **key absent** (fail-closed). Client
purchase-entry remains `"0"`. Play Console catalog **NOT RUN**.

---

## Workstreams

| Team | Authorized work this session | Approval still required |
|---|---|---|
| 1 Backend | A–F packet. Pin **applied**. E procedure `E_ENABLE_DISABLE.md` `9365dd1`. A/B paper YES. C/D/E live HOLD. F INJECTED YES. **Not executed.** | Owner letters; inspect first; E not live-executable |
| 2 Policy | P8 packet `b08690d` + inert wiring `540e07a`. Flag **false**. P3 PASS. P8 FAIL operationally. GRIN **synthetic-only**. **Do not advertise.** | Live purge grant = one-line flip; not done |
| 3 Build/device | `PHONE_HANDOFF.md` `c200712`. B1 checkout **`540e07a`**. B1≠B2 **ungranted**. Purchase-entry `"0"`. Device **NOT RUN**. Slot O UID private. | Recheck Play, then owner-lettered B1; Play B2 separate |
| 4 Billing/Play | Lifecycle correction in **`60c4bc1`**. T5 SOURCE+INJECTED **PASS** (`c69ffb9`). Catalog **NOT RUN**. Purchase-entry `"0"`. | Activation HOLD |
| 5 QA | `REVIEW_PIN_540e07a.md` `626cfa9` SOURCE+TOOLING **PASS**. App review `b3b1c97` stands. **P8 FAIL**. | Leftover P3-FAIL stay dirty |

---

## Owner decisions (recorded 2026-10-06)

See `docs/release/packets/OWNER_POLICY_DECISION_SHEET.md`. Authorize **source
implementation and tests** only. Not live deploy / billing / Play publish.

| Topic | Owner choice | Residual hold |
|---|---|---|
| GRIN pricing | **A — include in existing Starter / Professional / Business.** No separate SKU. One new issuance consumes one monthly record allowance. | Packet E real-store acceptance before public commercial copy |
| Storage quota | **Owner 2026-10-06: 1 / 3 / 10 GiB — wired** (`313025f`). **Do not advertise.** | Listing copy HOLD |
| Active / expiry | Keep issued evidence while entitled. After genuine expiry: 90-day read/export then 30-day notice. **No production purge job this assignment.** | Source state machine only until approved deploy |
| Explicit deletion | **45-day grace wired.** Supersedes 180. Play freeze ≠ delete. `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`. | Do not flip GRIN purge flag |
| Export | Pack is summary (`originalsBundled=false`). Originals + record export required. ZIP optional. | Device proof NOT RUN |
| Testers | Owner + two trusted testers. OnePlus 12R Android 16 vc22 **named**. Owner slot **O** uses an **existing** account; UID **received privately**. Values **not in repo**. Clean-install device unnamed. | D writes HOLD; T1/T2 UIDs still missing |

Internal Testing: **synthetic** GRIN evidence until lifecycle is **approved
for live use**. Source machinery exists; `INCLUDE_GRIN_IN_ACCOUNT_PURGE`
stays false. Real customer GRIN evidence remains blocked until then.

---

## Next concrete approval — A1 (not executed)

**A1 changes Firestore access rules only. It does not deploy Functions,
change Storage Rules/IAM, seed testers, enable GRIN, build the app,
enable payments, or submit to Play.**

Exact later command (firebase-tools **14.20.0**, cwd repo root):

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules
```

Hashes re-checked on combined after the T2 fold (`shasum -a 256`; Rules blobs unchanged vs `520f9f9`):

| Artifact | sha256 |
|---|---|
| Isolated config `firebase.rules-only.json` | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Firestore | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Live baseline / rollback Firestore | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| **Forbidden** repo-root `firestore.rules` | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` |

Live inspect 2026-10-06: Firestore sha256 **= baseline**. If a future inspect
differs, **abort** — do not apply this merged file. Rollback bytes:
`docs/release/rules-compat/live-export-2026-10-06/`. After a later grant,
post-deploy live Firestore sha256 must equal **`551203b8…`**; Storage
`1a912051…` unchanged; GRIN seven still ABSENT.

Do **not** execute A1 without explicit owner approval. A2–A7 are **not**
implied.

Full packets: `APPROVAL_A_BACKEND_PILOT.md`, `APPROVAL_B_INTERNAL_BUILD.md`,
`APPROVAL_C_RESTRICTED_BILLING.md`, `APPROVAL_D_PUBLIC_SUBMISSION.md`.

HOLD until written: main merge, live Functions/Rules/IAM/env writes, tester
admission, GRIN activation, EAS/native/OTA, Play upload/track/product,
billing activation, public rollout. `GRIN_OPS_ALLOW_LIVE=1` remains HOLD.
