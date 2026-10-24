# Vyaamikk Diary — architecture

This file describes the source tree in this checkout. It is a map of how the product is built, not a claim about what is deployed, enabled in production, or accepted on a device.

Older structure notes in `docs/REINITIALIZATION_ARCHITECTURE_MAP.md` (14 July 2026) are stale on the root provider tree, App Check, and billing. Use this file for the current layout.

**Product.** Vyaamikk Diary is an independent business diary for one owner account. It is not coupled to Vyaamikk Samadhaan backends. The operator is SPECIAL SOFTWARES; the legal operator is Ananya Engineered Industrial Components & Pay Systems LLP.

**Stack, as installed.**

| Concern | Choice |
|---|---|
| App | Expo SDK `~54.0.36`, React Native `0.81.5`, TypeScript strict |
| Navigation | Expo Router `~6.0.24`, file routes under `app/` |
| Native projects | Not checked in. EAS builds `ios/` and `android/` |
| Phone auth | `@react-native-firebase/auth` |
| Cloud data | Firebase JS SDK `firebase` `^12` for Firestore, Storage, and the bridged JS Auth session |
| Callables | `@react-native-firebase/functions` when the native SDK is linked; JS Functions SDK otherwise |
| Functions | Cloud Functions v2, region `asia-south1` |
| Local database | SQLite via `expo-sqlite`, schema version 9 |
| Canonical gate | `npm run ci:verify` |

---

## 1. Repository layout

| Path | Role |
|---|---|
| `app/` | Screens and layouts. Expo Router owns URLs. |
| `src/` | Domain, services, boot, sync, billing client, i18n, theme. |
| `functions/` | Admin SDK callables, schedulers, billing, identity, deletion. |
| `firestore.rules`, `storage.rules` | Client access policy. Server writes use the Admin SDK and bypass these rules. |
| `services/subscription-invoice-renderer/` | Separate Cloud Run HTML-to-PDF process. It does not read Firestore. |
| `public-site/` | Static marketing and legal site for vyaamikkdiary.in. Not part of the Expo bundle. |
| `tools/onboarding-ux-harness/`, `tools/billing-ux-harness/` | Isolated UI previews. |
| `docs/` | Release, privacy, billing, and this architecture note. |

`EXPO_PUBLIC_*` values are inlined into the client at build time. They are not secrets. Admin keys, SMS credentials, Resend keys, and KMS material stay on the server.

---

## 2. Runtimes and backends

`src/config/runtimeEnvironment.ts` classifies the process:

- `expo-go`
- `development-client`
- `store-or-standalone` (release APK/AAB and store installs)
- `web-dev`
- `web-production`

`getActiveBackend()` then resolves one of:

- `firebase-production` — the only production path
- `firebase-shared-dev` — shared dev OTP, not reachable from a production-mode binary
- `local-mock` — Expo Go mock OTP `000000`
- `not-configured` — production mode without a complete Firebase public config; the app fails closed

Standalone, preview, store, and the production development client must not fall through to local-mock OTP. `assertProductionConfig()` is not called at module scope in `app/_layout.tsx`; a throw there killed Android cold start. `BootstrapRoot` enforces the check in the UI.

There is no staging Firebase project in this repo.

Typical commands:

| Goal | Command |
|---|---|
| Mock UI in Expo Go | `npm run start:expo-go` |
| Native phone OTP against the dev client | `npm run start:prod-dev-client` |
| Internal APK | `eas build --profile preview` |
| Play AAB | `eas build --profile production` |

---

## 3. Process shape

```
app/_layout.tsx
└─ decideRootDataProviders()          always mounts; pathname must not gate this
   └─ GestureHandler → SafeArea → Theme
      → i18next → I18n → LocaleFont
      → LocalDbProvider
      → AuthProvider
      → CrashReportingBridge
      → SubscriptionProvider
      → IapProvider
      → QuotaUpsellHost
      → SyncProvider
      → AppFeedbackProvider
      → Stack
```

Providers mount once for the life of the process, including public routes (`/landing`, `/legal`). Gating `AuthProvider` on the pathname unmounts it while screens still call `useAuth()`.

Boot (`app/index.tsx`, `src/boot/resolveBootRoute.ts`):

1. Open SQLite and run migrations (`src/localDb/init.ts`). A failed database blocks startup.
2. Hide the splash and resolve a route from local state only. Boot routing does not wait on the network.
3. Restore the SecureStore session (`vyd_session_v2`). Production then revalidates `users/{uid}` over the JS Auth bridge, with a short timeout. A transient failure keeps the cached profile. A confirmed missing or blocked profile clears it.
4. Route to sign-in, email completion, profile or location onboarding, a composer-draft continuation sheet, or the You tab.
5. `SyncProvider` pulls and flushes only after `markBootNavigationSettled()`.

The JS Firebase app is created lazily in `src/config/firebase.ts`. The native Firebase app starts from `google-services.json` / `GoogleService-Info.plist`.

---

## 4. Navigation

Root stack, fade transitions.

**Signed-out and onboarding** (`app/(auth)/`): `v2` is the shipped entry. Also OTP, login, UEID, complete-profile, profile-review, onboarding intro, location, change-mobile, account recovery, and pending deletion.

**Public:** `app/(public)/landing` and `app/legal/[doc]`. These are inside the Expo bundle. The hosted site is `public-site/`.

**Signed-in tabs** (`app/(app)/(tabs)/`), native tabs:

1. Calendar
2. You (dashboard)
3. Saved records
4. Settings

**Record modules** under `app/(app)/`: composer, diary, customer credit, purchase order, professional pack, letterhead, statutory, at-a-glance, map, search, profile, drafts, and settings sub-screens (identity, subscription, insights, legal, deletion, dev reset).

Identity routing (`src/auth/identityRouteState.ts`, `src/boot/resolveAuthOnboardingRoute.ts`) decides whether a signed-in profile may reach the dashboard. Wizard back navigation is owned by `wizardNavigationController` and does not await AsyncStorage before moving.

---

## 5. Identity

Production sign-in is two Firebase Auth sessions that must name the same uid.

```
phone
 → native signInWithPhoneNumber          @react-native-firebase/auth
 → confirm OTP                            native Firebase user
 → resolveOrCreateUserByPhone             callable; native ID token
 → mintClientAuthToken                    custom token for that uid
 → signInWithCustomToken                  firebase JS Auth
 → sessionStore.save                      SecureStore profile cache
 → email OTP / link                       Resend, server-side
 → profile completion → UEID → location → You
```

Why two SDKs: phone OTP and the native callable token live on `@react-native-firebase/auth`. Firestore and Storage rules read `request.auth` from the **JS** SDK. Without `ensureJsAuthSession()` (`src/services/auth/jsAuthBridge.ts`), those writes are unauthenticated and the rules deny them. The bridge is single-flight, checks uid equality, and does not throw on a failed mint. JS Auth persistence is `getReactNativePersistence(AsyncStorage)`, so the bridged session can refresh after restart. That AsyncStorage blob is the Firebase credential JSON. It is not the profile cache, and it is not moved to SecureStore: the Auth user blob can exceed SecureStore’s item size.

The profile cache is separate:

| Store | Key | Contents | Where |
|---|---|---|---|
| SecureStore | `vyd_session_v2` | Full `UserProfile` plus `signedInAt` / `lastActiveAt`, JSON | iOS and Android |
| AsyncStorage | same key | Same JSON | Web, where SecureStore is unavailable |
| AsyncStorage | `vyd_onboarding_profile_draft_v1_{uid}` | In-progress onboarding fields | All platforms |

SecureStore encrypts its blob with the OS keystore. The app still writes plain JSON into that API. Firestore stores the same profile fields as ordinary document fields. Google encrypts disks at rest and the connection is HTTPS. The app does not encrypt profile, diary, or business fields before saving them. Purchase tokens are the exception: billing stores them as Cloud KMS ciphertext, because Firestore disk encryption is not treated as credential secrecy.

**Server-owned identity.** Clients cannot create `users/{uid}`. `resolveOrCreateUserByPhone` does. Rules reject client changes to `status`, uid, UEID, phone, email hash, and deletion or reactivation fields (`protectedIdentityFieldsUnchanged()`). Reverse indexes are unreadable and unwritable by clients:

```
phoneIndex/{phoneE164}
ueidIndex/{ueid}
emailIndex/{emailHash}
emailBindings/{emailHash}
retiredPhones/{phone}
pendingEmailVerifications/{id}
deletionJobs/{uid}
```

Email OTP, email change, account recovery, and mobile rebinding are callables. The client does not write those indexes in production.

**Account lifecycle.** Deletion is a grace period (`pending_deletion`) then `scheduledDeletionCleanup`. Reactivation requires a fresh phone OTP and the registered email, then restores `active` while keeping the same uid and UEID. Recovery can call Admin `revokeRefreshTokens`. That is account recovery, not a client-side logout of every phone.

**New device.** `functions/src/security/newDeviceSecurity.ts` is written so an unrecognized install records a security event, marks older `userSessions` revoked, and holds the new session until the security email is accepted. `AUTH_DEVICE_SESSION_MODEL.md` still records that immediate prior-device revoke is only partial, and that the email and “this wasn’t me” path are externally blocked. `userSessions.status` is an application registry. It is not, by itself, Firebase refresh-token revocation. Same-phone recognition after reinstall is best-effort.

**Session on this device.** `sessionStore` in `src/services/session.ts` loads and saves `vyd_session_v2`. `AuthProvider.signOut` signs out the JS SDK and the native phone SDK, then calls `forceClearAllSessions`, which deletes the profile key from both SecureStore and AsyncStorage. The local clear still runs if the SDK sign-out throws. That helper is also used for a blocked or mismatched boot profile and for the dev reset. It does not call `AsyncStorage.clear()`, so drafts and the diary outbox stay on the device. Account deletion uses `sessionStore.clear()` only.

---

## 6. Cloud data

Everything a person owns hangs under `users/{uid}`. Rules require `request.auth.uid == uid` and, for writes, an active account.

| Path | Who may write | Notes |
|---|---|---|
| `users/{uid}` | Owner, limited patch | Create and delete denied. Identity fields frozen. |
| `entries/{id}` | Owner | Diary and business entries, including letterhead mirrors. |
| `professionalPacks/{id}` | Owner | |
| `letterheadDocs/{id}` | Owner | Create does not consume ordinary quota. |
| `config/{id}` | Owner | Letterhead template config. |
| `customerCreditRecords/{id}` | Owner | |
| `purchaseOrders/{id}` | Owner | |
| `counters/{id}` | Owner create/update | Delete denied. Serials only move forward. |
| `_saveLocks/{clientRecordId}` | Owner create/update | Delete denied. Coordination, not content. |
| `trustedDevices/{id}` | Owner create/update | Client registry, not a revocation authority. Delete denied. |
| `securityEvents/{id}` | Server only | Owner may read. |
| `subscription/status` | Server only | Entitlement. Owner read. |
| `subscription/usageCurrent` | Owner, one narrow batch | +1 only while quota enforcement is on, same IST month, linked to a record created in that batch. |
| `subscription/billingDetails` | Server only | |
| `subscriptionBillingHistory/{id}` | Server only | Sanitized. Owner read. |
| `preferences/billingUx` | Owner | `benefitScreenShownAt` and `updatedAt` only. The shown-at stamp is immutable after create. |

Company billing, ledgers, invoices, credit notes, GSTR-1 batches, Play and App Store indexes, and reconciliation queues live at the root with client read and write denied. Prefixes include `_companyBilling`, `_subscriptionAuditLog`, `_processedBillingEvents`, `_billingEventLedger`, `_revenueReports`, `_trialLedger`, `_billingRateLimits`, `_playAccountIndex`, `_playCredentialIndex`, `_appStoreAccountIndex`, `_billingReconciliationQueue`, `_subscriptionInvoices`, `_gstr1FilingBatches`.

**Storage** (`storage.rules`), owner only, JS SDK `uploadString` base64 (`src/services/storage/userStorage.ts`). React Native `fetch(file://).blob()` is avoided because it has uploaded empty files.

| Path | Limit |
|---|---|
| `users/{uid}/letterhead/{file}` | image, under 10 MB |
| `users/{uid}/attachments/{recordId}/{file}` | image, under 10 MB |
| `users/{uid}/pdfs/{recordId}/{file}` | `application/pdf`, under 15 MB |
| `company/invoices/**`, `company/gstr1-reports/**` | client denied |

`storagePath` is canonical. `downloadUrl` is a cache that can be refreshed. Anything not matched is denied.

---

## 7. Local data

SQLite schema version 9 (`src/localDb/schema.ts`):

| Table | Use |
|---|---|
| `meta` | Schema version |
| `form_drafts` | Composer autosave |
| `entries_local` | Diary cache and pending edits |
| `sync_queue` | Outbound diary operations |
| `active_route` | Restore the in-progress composer route |
| `pincode_cache` | Postal lookup cache |
| `statutory_occurrences` | Statutory prompt state |
| `master_data_suggestions` | Party and item suggestions |
| `business_insights`, `business_insight_links` | Local insight index |

AsyncStorage holds preferences that are not the business record: language (`vyd_language_v1`), theme, intro-seen, recent searches, PDF preference, onboarding draft, and the JS Auth credential. Those values are JSON or small strings, not field-encrypted.

---

## 8. How a record is saved

Two paths.

**Diary and composer entries** are local-first. The screen writes SQLite (`src/services/diary/localFirst.ts`). `src/sync/syncEngine.ts` later creates, updates, or deletes `users/{uid}/entries/{id}`. Conflicts use `detectEntryConflict()`; a local edit is not silently replaced. An auth failure during sync locks `sessionSyncGate` and leaves the draft on device. The user re-authenticates. Hard sign-out is explicit.

Sync does not start until boot navigation has settled. In Expo Go it runs on foreground and reconnect. The queue is per session: a flush captures an admission token and will not apply an ack to a different session’s row.

**Customer credit, purchase order, professional pack, and letterhead** write Firestore directly through `beginCoordinatedSave()` (`src/services/records/saveCoordinator.ts`):

```
stable clientRecordId for the form session
 → process mutex
 → AsyncStorage idempotency record
 → Firestore users/{uid}/_saveLocks/{clientRecordId}   30-minute TTL
 → proceed | resume | return_done
 → base document
 → later steps (PDF, search, insights) via runRecordStepIfNeeded()
 → completeCoordinatedSave()
```

The idempotency key is `userId:recordKind:clientRecordId:draft:scope`. A completed step is not repeated. PDF failure marks `pdfFailed` and keeps the base record. A live lock returns `SaveStillInProgressError` instead of a second document. Purchase-order serials are allocated only after the existence check. Customer-credit payments dedupe on `clientPaymentId`.

Quota, when the server has turned enforcement on for that uid, is an atomic batch: the new record and exactly one `subscription/usageCurrent` increment. Letterhead document creates do not consume that ordinary quota. Enforcement is off unless the user document says otherwise.

---

## 9. Product modules

Composer types (`src/domain/businessEntry.ts`): letterhead matter, work update, staff matter, cash given, material dispatched / received / return, payment request, outward freight, and reminders. Diary categories (work, site, shop, factory, staff, and others) are a separate axis on the entry.

| Module | Local | Cloud |
|---|---|---|
| Diary / composer | SQLite draft, then sync | `entries` |
| Customer credit | Coordinated save | `customerCreditRecords` |
| Purchase order | Coordinated save | `purchaseOrders` plus `counters` |
| Professional pack | Coordinated save; drafts also in AsyncStorage | `professionalPacks` |
| Letterhead | Coordinated save; image may start as a data URI and migrate to Storage | `letterheadDocs`, `config`, Storage `letterhead/` |
| Cash-paid photo | Local file if upload fails | Storage `attachments/` |
| Statutory | SQLite occurrences plus on-device deadline engine | Prompt state is local |
| Insights | SQLite index, rebuilt from entries | Not a second source of truth |
| Maps / location | On-device; background location stays off | Footprint preference is a profile field |

Letterhead Matter PDFs do not carry Vyaamikk branding, the UEID, or the operator footer. Other PDFs share `pdfDocumentShell` and a fixed legal footer. Screens call `pdfService.ts`, not `expo-print` directly. Amounts, dates, and mobile numbers always format as `en-IN`, including when the UI is Hindi, Tamil, Telugu, or Gujarati. Purchase-order and letterhead PDFs are English. Gujarati PDFs translate structural labels only.

---

## 10. Billing

The client never grants entitlement.

```
Play or App Store purchase
 → IapProvider holds the store connection only
 → callable validateAndActivateAndroid / validateAndActivateIOS
 → server checks the store, writes _companyBilling and subscription/status
 → SubscriptionProvider reads users/{uid}/subscription/status
```

`IapProvider` does not decide access. `SubscriptionProvider` does not call the stores. `QuotaUpsellHost` asks the server view whether a new record is inside the plan.

Play billing stays fail-closed until `PLAY_BILLING_ENABLED=true`. App Store billing stays fail-closed until `APPSTORE_BILLING_ENABLED=true`. RTDN (`androidRtdn`) and App Store Server Notifications are signed server endpoints, not user-authenticated callables. Reconciliation is a scheduler plus a queue the client cannot write.

Purchase credentials on `_companyBilling` are KMS envelope ciphertext. The client never sends uid, plan, price, or expiry as authority.

GST invoices and GSTR-1 working papers are further callables (`updateBillingDetails`, `verifyGstinManual`, `getInvoiceDownloadUrl`, `generateGstr1WorkingPapers`, `markGstr1Filed`, `reviewSubscriptionTaxCompliance`). Tax documents are rendered by `services/subscription-invoice-renderer`, a Cloud Run service that receives HTML and returns PDF. It does not read Firestore, allocate invoice numbers, compute GST, see purchase tokens, or send mail. Functions invoke it with a Google ID token whose audience is that service URL.

---

## 11. Goods evidence

`src/goodsEvidence/` is a client domain for goods-receipt and GST evidence: quantities, e-way observations, a hash-chained ledger, and an evidence pack. `isGoodsEvidenceEnabled()` is false on store and standalone binaries even if `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1`. It is not a second billing system and it is not wired as a Cloud Function export in `functions/src/index.ts`.

---

## 12. Cloud Functions

`functions/src/index.ts` exports the public surface. `globalOptions.ts` must load first. Every function uses a fractional gen-1 CPU, concurrency 1, and `maxInstances: 3`, because a full gen-2 vCPU per service exhausts the `asia-south1` CPU quota.

| Group | Examples |
|---|---|
| Identity | `resolveOrCreateUserByPhone`, `claimMobile`, `mintClientAuthToken`, mobile quarantine and verified mobile change |
| Email | `startEmailVerification`, `verifyAndBindEmail`, `changeVerifiedEmail` |
| Recovery | `startAccountRecovery`, `completeAccountRecovery`, manual cases |
| Deletion | `ensureAccountDeletionJob`, `retireIdentity`, `completeAccountDeletion`, `scheduledDeletionCleanup` |
| Reactivation | `startAccountReactivation`, `completeAccountReactivation` |
| New device | `registerNewDeviceSecurityEvent`, was-not-me token handlers |
| Play | `prepareAndroidBillingAccount`, `validateAndActivateAndroid`, `androidRtdn`, reconciliation |
| App Store | `prepareIOSBillingAccount`, `validateAndActivateIOS`, `appStoreServerNotificationsV2` |
| GST | billing details, GSTIN, invoice URL, GSTR-1, tax review |

User callables run as the signed-in uid. Store notifications and the deletion scheduler authenticate as the platform, not as a diary user. Profile fields are not encrypted by these functions. OTP challenges and purchase credentials are.

---

## 13. Language, theme, and telemetry

Runtime strings load from `src/i18n/locales/*.json` (`en`, `hi`, `ta`, `te`, `gu`). `en.ts` and `hi.ts` are authored sources. Tamil, Telugu, and Gujarati are JSON. i18next falls back to English. A language change reloads through the language switch screen. Theme mode is local (`vyd_theme_mode_v1`).

App Check is initialized for both SDKs (`src/services/appCheck/bootstrap.ts`). A failed init is reported and does not abort startup. The native token is not copied into the JS custom provider. Crashlytics is bridged from `CrashReportingBridge` and follows the telemetry consent preference.

---

## 14. Boundaries that the rest of the code assumes

- Production binaries do not silently use mock OTP.
- The client is not the authority for identity indexes, account status, UEID, phone, entitlement, or invoice numbers.
- Firestore and Storage see the JS Auth user. Phone OTP sees the native user. Those uids must match.
- Diary edits survive offline in SQLite. Other record types need the coordinated Firestore write.
- One `clientRecordId` produces one document. Retries resume; they do not insert a second row.
- Counters and save locks are not deletable by the client.
- Letterhead Matter PDFs stay free of product branding.
- Device-integrity probing is not part of login.
- Android background location stays off.
- Goods evidence stays off on store builds.
- Play and App Store activation stay fail-closed until the matching server flag is set.
- Signing out this device does not clear drafts or run `AsyncStorage.clear()`.

---

## 15. How to check a change

`npm run ci:verify` is the gate: app typecheck, ESLint, `npm run test:all`, Functions build, Firestore rules, live-rules compatibility, Storage rules, identity and billing emulator suites, Expo public config, and the invoice-renderer build. Emulator tests are not a live Firebase project and not a two-device check.

Useful narrower commands are listed in `package.json` (`test:auth-policy-matrix`, `test:save-hardening`, `test:firestore-rules`, `test:billing-transaction-emulator`, and others).

---

## 16. Documents that go deeper

| Topic | File |
|---|---|
| Offline boot and drafts | `docs/OFFLINE_FIRST.md` |
| Identity invariants | `docs/IDENTITY_CONTACT_INVARIANTS.md` |
| Storage rules narrative | `docs/STORAGE_SECURITY.md` |
| Billing schema | `docs/BILLING_FIRESTORE_SCHEMA.md` |
| Billing threat model | `docs/BILLING_THREAT_MODEL.md` |
| Data inventory | `docs/privacy-legal-audit/TECHNICAL_DATA_INVENTORY.md` |
| Release readiness | `STABILIZATION_AND_RELEASE_READINESS.md` |
