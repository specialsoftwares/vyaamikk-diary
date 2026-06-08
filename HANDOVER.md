# Vyaamikk Diary — Technical Handover

> **Audience:** Any AI assistant (ChatGPT/Claude/etc.) or engineer picking up
> this codebase. Read this top-to-bottom once; you will then have enough
> context to take instructions and make changes correctly.
>
> **Last updated:** 2026-05-31 — Unified PDF layout (profile header + single footer), duplicate metadata removed.
> **Author of this handover:** Claude (Cursor IDE agent), as the lead/product
> engineer on the original build.

---

## Table of Contents

1. [Product & Strategic Context](#1-product--strategic-context)
2. [Build Status & Repo Layout](#2-build-status--repo-layout)
3. [Exact Stack & Versions](#3-exact-stack--versions)
4. [How to Run / Develop](#4-how-to-run--develop)
5. [Architecture at a Glance](#5-architecture-at-a-glance)
6. [The Vyaamikk UEID System](#6-the-vyaamikk-ueid-system)
7. [Auth Layer (Service Abstraction)](#7-auth-layer-service-abstraction)
8. [Diary Layer (Repository Abstraction)](#8-diary-layer-repository-abstraction)
9. [State Management](#9-state-management)
10. [Routing (Expo Router) & Screen Catalog](#10-routing-expo-router--screen-catalog)
11. [UI System & Design Tokens](#11-ui-system--design-tokens)
12. [Validation, Errors, Logging](#12-validation-errors-logging)
13. [Security, Privacy, Firestore Rules](#13-security-privacy-firestore-rules)
14. [Known Limitations & Integration Seams](#14-known-limitations--integration-seams)
15. [Session History — What Already Happened](#15-session-history--what-already-happened)
16. [How to Instruct Further Work](#16-how-to-instruct-further-work)

---

## 1. Product & Strategic Context

**App name:** Vyaamikk Diary
**Brand:** by SPECIAL SOFTWARES
**Product type:** Simple daily diary/log app for work, business, factory, site,
shop, contractor, MSME, and personal operational records — not limited to
factories.
**Positioning line:** *"A simple digital diary to record daily work, issues,
production, staff notes, site activity, business follow-ups and proof of work."*

### Strategic constraints (these must not be violated)

- ✅ **Independent identity system.** Vyaamikk Diary has its **own** UEID
  registry. It is the first identity registry of the SPECIAL SOFTWARES
  ecosystem, and is future-compatible so the same `mobile → UEID` mapping
  can be migrated into Vyaamikk Samadhaan **without changing the user's ID**.
- ❌ **Do NOT connect to existing Vyaamikk Samadhaan backend.**
- ❌ **Do NOT fetch existing VS UEIDs or reuse VS role/connection/DM/payroll/
  attendance/approval logic.**
- ❌ **Do NOT create a useless device-local random ID.** The UEID is
  server-side and survives reinstall / device change.

### V1 Golden Flow

```
Open app → Mobile login → OTP verification → UEID created/fetched → Dashboard
→ Add diary entry → View history → Open entry → Share entry → Profile/Settings
→ View UEID
```

### Explicitly OUT of scope for V1 (do not add without an explicit ask)

Roles, company/professional/employee, DMs, connections, approvals, payroll,
attendance, punch / geo-tracking, CCTV / surveillance, payments, lending,
marketplace, Aadhaar / KYC, admin panel, organization/team management, AI
features, push reminders, multi-product ecosystem screens.

---

## 2. Build Status & Repo Layout

### Status

| Item | Status |
|---|---|
| Project scaffolded | ✅ Expo + TypeScript + Expo Router |
| All V1 screens built | ✅ Splash, Login, OTP, UEID, Dashboard, Diary CRUD, Profile, Settings, Delete Account, About |
| Auth abstraction (mock + Firebase) | ✅ Mock fully working; Firebase has 2 documented integration seams for native phone OTP |
| Diary repository (mock + Firestore) | ✅ Both implementations fully functional |
| UEID registry (`VYD-YYYY-XXXXXX`) | ✅ With server-side uniqueness via Firestore transaction |
| Design system (tokens + UI primitives) | ✅ Button, Card, TextField, Banner, EmptyState, ErrorState, Header, Loader, Pill, Screen |
| Firestore security rules | ✅ `firestore.rules` |
| `.env.example` + dev/prod mode switch | ✅ `EXPO_PUBLIC_APP_MODE=development\|production` |
| TypeScript strict | ✅ `tsc --noEmit` clean |
| `expo-doctor` | ✅ 18/18 checks pass |
| iOS bundle | ✅ Bundles cleanly (~6.5 MB Hermes) |
| Running on physical iPhone via Expo Go | ✅ (after SDK 54 downgrade) |
| Running on iOS simulator | ⚠️ Requires Xcode (user only has Command Line Tools) |
| Running on Android | ⚠️ Not tested; should work, no Android SDK installed locally |

### Workspace layout (flattened — project sits at workspace root)

```
/Users/shivamsaurav/Vyaamikk Diary/        ← workspace root, where you run npm
├── HANDOVER.md                              ← (this file)
├── README.md                                ← User-facing readme (also covers go-to-prod)
├── package.json
├── package-lock.json
├── .npmrc                                   ← legacy-peer-deps=true (needed for Firebase)
├── .env.example                             ← Copy to .env
├── .gitignore
├── tsconfig.json                            ← Strict, with "@/*" → src/* path alias
├── app.json                                 ← Expo config (scheme, plugins, bundle IDs)
├── metro.config.js                          ← Extends expo/metro-config (doctor requirement)
├── firestore.rules                          ← Production-ready Firestore rules
├── assets/                                  ← icon.png, splash-icon.png, adaptive icons, favicon
│
├── app/                                     ← Expo Router file-based routes
│   ├── _layout.tsx                          ← Root layout: providers + Stack
│   ├── index.tsx                            ← Splash / Boot — resolves auth, picks route
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx                        ← Mobile + consent
│   │   ├── otp.tsx                          ← OTP verify (+ dev banner with code 123456)
│   │   └── ueid.tsx                         ← Welcome / UEID created or fetched
│   └── (app)/
│       ├── _layout.tsx                      ← Bounces to /(auth)/login if signed_out
│       ├── dashboard.tsx                    ← Hero + action grid + recent entries
│       ├── profile.tsx                      ← UEID + mobile + joined date + app version
│       ├── diary/
│       │   ├── index.tsx                    ← History (search + filter + pull-to-refresh)
│       │   ├── new.tsx                      ← Save / Save & Share
│       │   ├── [id].tsx                     ← Detail (Edit / Share / Delete)
│       │   └── edit/[id].tsx                ← Edit entry
│       └── settings/
│           ├── index.tsx                    ← About, Privacy, Terms, Delete, Logout
│           ├── about.tsx                    ← About Vyaamikk Diary
│           └── delete.tsx                   ← Type "DELETE" to confirm
│
└── src/
    ├── components/
    │   ├── ui/
    │   │   ├── Banner.tsx
    │   │   ├── Button.tsx
    │   │   ├── Card.tsx
    │   │   ├── EmptyState.tsx
    │   │   ├── ErrorState.tsx
    │   │   ├── Header.tsx
    │   │   ├── Loader.tsx
    │   │   ├── Pill.tsx
    │   │   ├── Screen.tsx
    │   │   ├── TextField.tsx
    │   │   └── index.ts                     ← barrel export
    │   └── diary/
    │       ├── CategoryPicker.tsx           ← CategoryPicker + CategoryFilter
    │       ├── EntryForm.tsx                ← Shared Add/Edit form (RHF + Zod)
    │       └── EntryRow.tsx                 ← Single-row card in lists
    ├── config/
    │   ├── env.ts                           ← Reads EXPO_PUBLIC_*, derives APP_MODE
    │   └── firebase.ts                      ← Lazy init + FirebaseNotConfiguredError
    ├── domain/
    │   ├── categories.ts                    ← CATEGORIES list + categoryLabel()
    │   ├── errors.ts                        ← AppError + userFacingMessage
    │   └── types.ts                         ← UEID, PhoneE164, UserProfile, DiaryEntry, AuthSession
    ├── services/
    │   ├── auth/
    │   │   ├── firebase.ts                  ← Firestore-backed; native OTP seam (UNWIRED)
    │   │   ├── mock.ts                      ← Working dev backend, OTP = "123456"
    │   │   ├── types.ts                     ← AuthService, OtpChallenge
    │   │   └── index.ts                     ← getAuthService() selects by env.appMode
    │   ├── diary/
    │   │   ├── firebase.ts                  ← Firestore repository
    │   │   ├── mock.ts                      ← AsyncStorage repository
    │   │   ├── types.ts                     ← DiaryRepository contract
    │   │   └── index.ts                     ← getDiaryRepository() selector
    │   └── session.ts                       ← SecureStore (native) / AsyncStorage (web) wrapper
    ├── state/
    │   ├── auth.tsx                         ← <AuthProvider> + useAuth()
    │   ├── network.ts                       ← useIsOnline()
    │   └── useDiaryList.ts                  ← list+refresh hook (stable callbacks)
    ├── theme/
    │   ├── colors.ts                        ← Palette
    │   ├── spacing.ts                       ← spacing + radius
    │   ├── typography.ts
    │   └── index.ts                         ← barrel
    └── utils/
        ├── date.ts                          ← date-fns wrappers
        ├── id.ts                            ← shortId() — no uuid dep
        ├── logger.ts                        ← Privacy-aware (redacts OTP, masks phone)
        ├── phone.ts                         ← normalizeIndianMobile, maskMobile
        ├── share.ts                         ← formatEntryForShare + shareEntry()
        ├── ueid.ts                          ← generateUEID(), isValidUEID()
        └── validation.ts                    ← Zod schemas: phone, otp, entry
```

---

## 3. Exact Stack & Versions

> **Important:** The project was originally built on **Expo SDK 56** but was
> downgraded to **SDK 54** mid-session because Expo Go for SDK 56 is not on
> the iOS App Store (see [Session History](#15-session-history--what-already-happened)).

### Runtime

| Package | Version | Notes |
|---|---|---|
| `expo` | `~54.0.0` | Currently `54.0.35` |
| `react-native` | `0.81.5` | |
| `react` | `19.1.0` | |
| `expo-router` | `~6.0.24` | File-based routing |
| `react-native-reanimated` | `~4.1.1` | Needs `react-native-worklets` peer |
| `react-native-worklets` | (Expo-aligned) | Required by reanimated 4 |
| `react-native-gesture-handler` | `~2.28.0` | |
| `react-native-safe-area-context` | `~5.6.0` | |
| `react-native-screens` | `~4.16.0` | |
| `expo-secure-store` | `~15.0.8` | Session storage |
| `expo-splash-screen` | `~31.0.13` | Configured as plugin |
| `expo-status-bar` | `~3.0.9` | |
| `expo-system-ui` | `~6.0.9` | |
| `expo-clipboard` | `~8.0.8` | Copy UEID |
| `expo-haptics` | `~15.0.8` | (Imported but currently unused; safe to remove later) |
| `expo-linking` | `~8.0.12` | |
| `expo-constants` | `~18.0.13` | For app version |
| `@react-native-async-storage/async-storage` | `2.2.0` | Mock backends + web session fallback |
| `@react-native-community/netinfo` | `11.4.1` | Online/offline indicator |
| `firebase` | `^12.14.0` | JS SDK (Firestore + Auth — Auth used only via seam) |
| `react-hook-form` | `^7.76.1` | All forms |
| `@hookform/resolvers` | `^5.4.0` | Zod resolver |
| `zod` | `^4.4.3` | Validation. **Note:** v4 made `.default()` change input vs output types — see `src/utils/validation.ts` |
| `date-fns` | `^4.4.0` | Date formatting |

### Dev

| Package | Version |
|---|---|
| `typescript` | (Expo-aligned) |
| `@types/react` | `~19.1.10` |

### TypeScript config

- `strict: true`
- Path alias: `@/*` → `./src/*`, `@app/*` → `./app/*`
- Uses `expo/tsconfig.base`

### npm config

`.npmrc` contains `legacy-peer-deps=true` — required because Firebase 12's
peer deps don't perfectly match the SDK 54 React tree. `npm install` and
`npx expo install` both honor this.

---

## 4. How to Run / Develop

```bash
cd "/Users/shivamsaurav/Vyaamikk Diary"

# First time only
npm install              # legacy-peer-deps is auto-applied via .npmrc
cp .env.example .env     # defaults to development mode

# Start Metro
npm run start            # then press i / a, or scan QR with Expo Go on iPhone
# or
npm run start -- --clear # if you need to nuke the Metro cache

# Other scripts
npm run typecheck        # tsc --noEmit
npm run ios              # expo start --ios (needs Xcode for simulator)
npm run android          # expo start --android (needs Android Studio / emulator)
npx expo-doctor          # 18/18 should pass
```

### Default dev login flow (no Firebase needed)

1. Open the app → Login screen
2. Enter any 10-digit Indian mobile starting with 6/7/8/9 (e.g. `9876543210`)
3. Tick the consent box → **Send OTP**
4. The OTP screen will show an info banner: **"Use OTP code 123456…"**
5. Enter `123456` → Verify
6. First time: see UEID welcome screen → Continue to Diary
7. Returning user (same number): see "Welcome back" + same UEID

The dev backend persists across reloads via AsyncStorage, so the
"one phone = one UEID" contract is honored.

---

## 5. Architecture at a Glance

```
┌────────────────────────────────────────────────────────────────┐
│                       Expo Router screens                       │
│   app/(auth)/login.tsx  app/(app)/dashboard.tsx  …             │
│                                                                 │
│   Screens depend on:                                            │
│   - <AuthProvider> via useAuth()                                │
│   - useDiaryList() hook                                         │
│   - UI primitives in src/components/ui/                         │
└────────────────────────────────────────────────────────────────┘
                              ▲
                              │ (consumes)
                              │
┌────────────────────────────────────────────────────────────────┐
│                 State layer (src/state/*)                       │
│  • auth.tsx     — AuthProvider, session restore, signOut, etc. │
│  • useDiaryList.ts — list + refresh, STABLE callbacks          │
│  • network.ts   — useIsOnline()                                │
└────────────────────────────────────────────────────────────────┘
                              ▲
                              │ (calls)
                              │
┌────────────────────────────────────────────────────────────────┐
│              Service layer (src/services/*)                     │
│  AuthService                  DiaryRepository                   │
│  ├── mock.ts (AsyncStorage)   ├── mock.ts (AsyncStorage)        │
│  └── firebase.ts (Firestore)  └── firebase.ts (Firestore)       │
│  selected by env.appMode       selected by env.appMode          │
│                                                                 │
│  session.ts — SecureStore (native) / AsyncStorage (web)         │
└────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌────────────────────────────────────────────────────────────────┐
│                 Config layer (src/config/*)                     │
│  env.ts — APP_MODE, brand strings, Firebase config              │
│  firebase.ts — Lazy initializeApp(), throws if unconfigured     │
└────────────────────────────────────────────────────────────────┘
```

**Golden rule:** Screens **never** touch the service layer or Firebase
directly. They go through `useAuth()` or `useDiaryList()` / `getDiaryRepository()`.
This is what makes the mock/Firebase swap a config flag.

---

## 6. The Vyaamikk UEID System

This is the most distinctive architectural piece. Read carefully.

### Format

```
VYD-YYYY-XXXXXX
^   ^    ^
│   │    └── 6 chars from alphabet "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
│   │        (no 0/O, no 1/I/L — unambiguous when read out loud / typed)
│   └────── Year of issue
└────────── Product prefix; VYD = Vyaamikk Diary, first product to issue UEIDs
            into the SPECIAL SOFTWARES identity registry
```

Example: `VYD-2026-8K4P9X`

### Invariants

| # | Rule |
|---|---|
| 1 | One verified mobile number ⇒ exactly one UEID, forever. |
| 2 | UEIDs never change and are never re-issued (even if the user soft-deletes their account). |
| 3 | Returning users (same mobile) always receive the **same** UEID. |
| 4 | UEIDs do not encode or reveal the mobile number. |
| 5 | Mobile numbers are stored in normalized E.164 (e.g. `+919876543210`). |
| 6 | The UEID index is **not** publicly enumerable (locked in `firestore.rules`). |

### How uniqueness is enforced (production)

In `src/services/auth/firebase.ts → resolveOrCreateUser()`, a Firestore
transaction does:

```
1. read phoneIndex/{phoneE164}
   • if exists → read users/{uid}, return profile (revive if previously soft-deleted)
2. else
   • loop up to 8 times:
       a. candidate = generateUEID()
       b. read ueidIndex/{candidate}
       c. if not exists → reserve it (tx.set), break
   • if loop exhausts → throw "Could not allocate a unique Vyaamikk ID"
3. write users/{uid}, phoneIndex/{phoneE164}, ueidIndex/{ueid} atomically
```

The 30^6 ≈ 729M address space means collisions are vanishingly rare; the
retry+throw still surfaces the impossible case rather than spinning forever.

### Dev path

`src/services/auth/mock.ts` mirrors the same contract, keyed on
AsyncStorage. The registry shape is:

```ts
{
  phoneToUid: { [phoneE164]: uid },
  users: { [uid]: UserProfile },
  ueidIndex: { [ueid]: true },
}
```

Wiping mock data: call `__resetMockRegistry()` (exported but not barreled).

### Future migration to Vyaamikk Samadhaan

Because the identity model is `phone → UEID` with a server-side ledger,
porting it to VS later is purely a **data migration** — no UEIDs change,
no users experience an ID renaming. Just copy the registry collections
into VS and have VS auth read from them.

---

## 7. Auth Layer (Service Abstraction)

### Contract — `src/services/auth/types.ts`

```ts
export interface AuthService {
  startOtp(phoneE164: PhoneE164): Promise<OtpChallenge>;
  confirmOtp(challenge: OtpChallenge, code: string): Promise<UserProfile>;
  signOut(): Promise<void>;
  requestAccountDeletion(uid: string): Promise<void>;
}

export interface OtpChallenge {
  verificationId: string;
  phoneE164: PhoneE164;
  /** Surfaced ONLY in development; null in production. */
  devCodeHint: string | null;
}
```

### Selector — `src/services/auth/index.ts`

```ts
export function getAuthService(): AuthService {
  if (env.isProduction) {
    if (!isFirebaseConfigured()) return notConfiguredService;
    return firebaseAuthService;
  }
  return mockAuthService;
}
```

`notConfiguredService` is a stub that throws `AppError('auth_not_configured')`
on every call, so the UI shows a clean "Login service is not configured"
state instead of crashing.

### Mock — `src/services/auth/mock.ts`

- OTP code: hardcoded `"123456"`
- ~400ms simulated network latency to keep loading states honest
- Stores registry in AsyncStorage under key `vyd_mock_registry_v1`
- Enforces all UEID invariants

### Firebase — `src/services/auth/firebase.ts`

**Status:** Firestore side fully implemented; phone-OTP side intentionally
unwired with two clearly-marked integration seams.

```ts
// INTEGRATION SEAM #1
async startOtp(_phoneE164) {
  // TODO: install @react-native-firebase/auth (or custom SMS provider)
  // and call its verifyPhoneNumber. Return { verificationId, phoneE164, devCodeHint: null }.
  throw new AppError("auth_not_configured", "Production phone OTP is not wired in this build.");
}

// INTEGRATION SEAM #2
async confirmOtp(_challenge, _code) {
  // TODO:
  //   1. Build PhoneAuthCredential from (verificationId, code).
  //   2. await signInWithCredential(getFirebaseAuth(), credential).
  //   3. const authUid = getFirebaseAuth().currentUser!.uid;
  //   4. return resolveOrCreateUser(authUid, phoneE164);
  throw new AppError("auth_not_configured", "Production phone OTP is not wired in this build.");
}
```

`resolveOrCreateUser` is exported as `__firebaseAuthInternals.resolveOrCreateUser`
so you don't have to re-implement it when wiring real OTP.

**Why unwired?** Firebase JS SDK doesn't ship a native phone verifier for
React Native. The recommended fix is to add `@react-native-firebase/auth`
(separate npm package) and call its `verifyPhoneNumber`.

---

## 8. Diary Layer (Repository Abstraction)

### Contract — `src/services/diary/types.ts`

```ts
export interface DiaryRepository {
  create(userId: string, input: CreateDiaryEntryInput): Promise<DiaryEntry>;
  update(userId: string, input: UpdateDiaryEntryInput): Promise<DiaryEntry>;
  /** Soft-delete: sets deletedAt rather than removing the row. */
  softDelete(userId: string, id: string): Promise<void>;
  getById(userId: string, id: string): Promise<DiaryEntry | null>;
  list(userId: string, options?: ListDiaryEntriesOptions): Promise<DiaryEntry[]>;
}
```

### Data shape — `src/domain/types.ts`

```ts
export interface DiaryEntry {
  id: string;
  userId: string;
  title: string;
  category: DiaryCategory;     // 11 enum values: work, business, site, shop, factory, staff, issue, production, followup, personal, other
  notes: string;
  entryDate: number;           // epoch millis at local midnight
  location: string | null;
  quantity: string | null;     // free text (e.g. "12 boxes")
  issue: string | null;
  tags: string[];              // max 10, each ≤ 30 chars
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}
```

### Storage layouts

| Mode | Collection / Key |
|---|---|
| Mock (dev) | AsyncStorage key `vyd_diary_v1_<userId>` holds JSON array of `DiaryEntry` |
| Firebase (prod) | Firestore: `users/{uid}/entries/{entryId}` |

### Filter/search behavior

In-memory after fetch (V1 simplification). The search field matches against
`title`, `notes`, `location`, `issue`, and `tags`. Categories filter by
exact match. Sort is `entryDate DESC, createdAt DESC`. For large datasets
upgrade to Firestore `where()` + `orderBy()` with composite indexes.

---

## 9. State Management

### Auth — `src/state/auth.tsx`

```ts
export type AuthStatus = "loading" | "signed_out" | "signed_in";

interface AuthApi {
  status: AuthStatus;
  session: AuthSession | null;
  user: UserProfile | null;
  justCreated: boolean;        // true briefly after first-time OTP success
  startOtp(phoneE164): Promise<OtpChallenge>;
  confirmOtp(challenge, code): Promise<UserProfile>;
  signOut(): Promise<void>;
  requestAccountDeletion(): Promise<void>;
  acknowledgeUEID(): void;     // dismisses the welcome screen
}

export function useAuth(): AuthApi { … }
```

- Mounted at the root in `app/_layout.tsx`.
- On boot, restores session from `SecureStore` (key `vyd_session_v1`).
- `app/index.tsx` (boot) reads `status` + `justCreated` and routes accordingly.
- `app/(app)/_layout.tsx` bounces to login if `status === "signed_out"`.

### Diary list — `src/state/useDiaryList.ts`

Returns `{ entries, loading, refreshing, error, refresh, reload }`.

**Critical invariant:** `refresh` and `reload` are wrapped in `useCallback`
keyed on `fetchOnce`. If you ever return raw arrow functions here, every
screen using `useFocusEffect(useCallback(() => void reload(), [reload]))`
will enter an infinite render loop. There's an inline comment in the file
explaining this — preserve it.

### Network — `src/state/network.ts`

`useIsOnline(): boolean` — subscribes to NetInfo. Used by Login, OTP, and
Dashboard to show a warning banner when offline.

---

## 10. Routing (Expo Router) & Screen Catalog

```
/                          ← app/index.tsx (Splash/Boot, decides route)
/(auth)/login              ← Mobile + consent form
/(auth)/otp                ← OTP verify
/(auth)/ueid               ← UEID welcome (new + returning)
/(app)/dashboard           ← Hero + 4 action cards + recent entries
/(app)/profile             ← UEID display, mobile, joined, app version
/(app)/diary               ← History: search + category filter + pull-to-refresh
/(app)/diary/new           ← Add: Save / Save & Share
/(app)/diary/[id]          ← Detail: Edit / Share / Delete
/(app)/diary/edit/[id]     ← Edit
/(app)/settings            ← Index: About, Privacy, Terms, Delete, Logout, version footer
/(app)/settings/about      ← About copy
/(app)/settings/delete     ← Type "DELETE" to confirm, then double-Alert.alert
```

### Boot sequence (offline-first, 2026-05-31)

Order on cold start:

1. Native splash (`SplashScreen.preventAutoHideAsync` in `app/_layout.tsx`).
2. **SQLite** via `LocalDbProvider` → `initializeLocalDatabase()` (blocks on failure with `LocalDbErrorScreen`).
3. **Theme / language** hydrate from AsyncStorage in parallel (not a hard gate).
4. **Session** from SecureStore after DB ready (`AuthProvider`) — no network token check.
5. Intro cards (`VyaamikkIntroSplash`) once per install (`introSplashStorage` AsyncStorage flag).
6. **Local routing** in `app/index.tsx` via `resolveBootDestination()`:
   - signed out → login
   - `justCreated` → UEID
   - incomplete profile → complete profile
   - **composer draft / active route** → premium sheet (`BootDraftContinuationSheet`), not silent redirect
   - else → `/(tabs)/you`
7. **Background sync** (`SyncProvider`) only after `markBootNavigationSettled()` in `src/boot/bootGate.ts` (after route or sheet decision).

**Draft resume at boot (composer-only):** SQLite `form_drafts` + `active_route`. Letterhead, professional-pack, and identity drafts still use legacy paths and are **not** offered on boot until migrated to `formDraftsRepository`.

**Sheet actions:** Continue → composer; Go to dashboard → clear `active_route`, keep draft; Delete → clear draft + `active_route` (confirm via system alert on destructive action only).

Branded boot spinner shows only while `auth.status === 'loading'` after intro — not after session is restored.

See also `docs/OFFLINE_FIRST.md`.

### Calendar & Maps tab (2026-05-31)

**Tab label:** `calendarMaps.tabLabel` — “Calendar & Maps”. **Screen:** integrated `app/(app)/(tabs)/calendar.tsx` with Calendar | Map segmented control. Legacy `app/(app)/map.tsx` redirects here.

**Removed:** Top “New Record” button when the selected date has records; empty date shows `PremiumNewRecordButton` only. No redirect to You except empty-state CTA.

**Services:** `src/services/calendarMaps/calendarMapsService.ts`, `useCalendarMapsData`, `src/utils/location/entryLocation.ts`, `src/services/location/locationRecordService.ts`.

**Calendar view:** Month grid + categorized `SectionList` per selected date (payments, freight, materials, staff, work, reminders, letterhead, pro packs). Large section headers (`titleLg`).

**Map view:** `react-native-maps` + `PROVIDER_DEFAULT` (Apple Maps iOS / Google Android). Only entries with GPS (`location.gps` or legacy `location.geo`). `mapPadding` + preview card positioned above tab bar — native attribution corners left clear. No custom text claiming Apple/Google licensing.

**Location model:** `EntryLocation` extended with optional `gps: RecordGpsLocation` (ISO `capturedAt`, `source`, `permissionSnapshot`). Manual site/destination fields remain in payloads and search without GPS.

**Permission:** Rationale modal (`calendarMaps.permission.*`) before native prompt; composer `ComposerGpsLocationField`; map “Enable location” CTA. Foreground-only via `expo-location`; no launch-time request. Detail screen **Remove GPS** via `stripGpsFromLocation`.

**Search:** `buildSearchableLocationText()` indexes manual locations + `addressLabel`; raw lat/lng not logged (see `logger.ts` redaction).

**Privacy:** DPDP/App Store/Play — precise location opt-in, user-scoped sync, no background tracking V1; document in privacy policy before store submission.

**Manual test:** Deny permission → calendar works, map shows optional copy. Grant + attach GPS on composer entry → marker + preview + open detail. Remove GPS → marker gone.

**UX polish (2026-05-31):** Single scroll owner (`SectionList` / `ScrollView` for empty day); `CalendarMapsModeTransition` crossfade; map coordinate bucketing (`mapClustering.ts`, count badges); combined tab icon `CalendarMapsTabIcon`; removed standalone follow-up legend block (compact record/due dots only); section spacing via `titleLg` headers.

### You bottom-tab icon — product identity (2026-05-31)

| Item | Detail |
|------|--------|
| **Previous icon** | Unicode solid circle `●` via `TabGlyph` in `app/(app)/(tabs)/_layout.tsx` — read as a generic dot, not “my diary / command centre”. |
| **Concepts compared (in-app)** | Set `EXPO_PUBLIC_YOU_TAB_ICON_CONCEPT` and reload to preview each in the real tab bar (same size, active/inactive tints, light/dark/system): **`notebook`** — `book-open-page-variant-outline` + `account-circle-outline` badge; **`ledger`** — `file-document-multiple-outline` + same badge; **`command`** — `view-dashboard-outline` + same badge. |
| **Chosen** | **`notebook`** (open diary + identity badge). Most distinctive vs Calendar (dates/location) and Settings (gear); reads as *my business diary* at 22–24px. Ledger felt like “files stack”; command grid felt closer to a generic dashboard tab. Badge kept at 9–10px bottom-right (mirrors calendar map-pin overlay) — not cluttered at tab-bar scale. |
| **Where updated** | `src/components/you/YouTabIcon.tsx` (new); wired in `app/(app)/(tabs)/_layout.tsx`. |
| **Unchanged** | Tab label **You** (`t("you.title")`), tab order (Calendar → You → Settings), `initialRouteName="you"`, tab bar height/padding/safe-area (`computeTabBarMetrics`), glass backdrop, routes, navigation. |
| **Theming** | Active: `tabBarActiveTintColor` → `colors.primary`. Inactive: `colors.textMuted`. Icons use `MaterialCommunityIcons` outline glyphs (same family as `CalendarMapsTabIcon`) — inherits light/dark/system via existing tab tint. |
| **Platforms** | iOS + Android: vector icon font via `@expo/vector-icons` (same stack as Calendar tab). Visual QA: compare three concepts on device/simulator; confirm focused/unfocused sizes (24/22 main, 10/9 badge). |

### Delivery / Freight Map Intelligence — QA pass (2026-05-31)

**Scope:** Static dispatch / freight facts on Calendar & Maps only. No live vehicle tracking, routes, transporter marketplace, or new sync/business rules.

**Code:** `src/services/calendarMaps/freightDispatchMapIntel.ts`, `FreightDispatchMapIntelView.tsx`, wired in `calendarMapsService`, `CalendarMapRecordRow`, `CalendarMapsMapPanel`, `MapLocationClusterSheet`. Search: `buildSearchableText` + per-record `searchableLocationText` on map models.

**Field order (map pin card):** Origin → Delivery → Bill/Challan · LR → Vehicle · Transporter → boxes/weight → freight type → clarification contact. Blank optionals omitted entirely (no empty labels).

**Surfaces**

| Surface | Behaviour |
|---------|-----------|
| Map — single pin | Compact card: route headline + detail lines; **Open record** CTA |
| Map — cluster | Header = best **Origin → Delivery** among rows; list rows show bill/LR/vehicle meta only (route not repeated) |
| Calendar day list | One–two line `·`-separated snippet; date in meta; no duplicate route in meta when intel present |
| Global search | Bill, challan, LR, vehicle, transporter, origin, delivery, destination, clarification name, mobile last-4 (existing), party/material |

**Privacy copy (EN/HI):** Map banner and hints say **dispatch details / freight information / delivery reference** — explicitly **not** live routes or vehicle monitoring. Pins only when user attached GPS; manual delivery/destination text is searchable but does **not** create a pin (`buildMapMarkerRecords` → `entryHasGpsFootprint` only).

#### Sample test records (create in composer, attach GPS only when testing map pins)

| # | Type | Data entered | Expected UI |
|---|------|----------------|-------------|
| A | `outward_freight_details` | From: Indore WH · To: Mumbai · Bill FR-2026-12 · LR 44821 · Vehicle MH12AB1234 · Transporter ABC Logistics · 24 boxes · 450 Kg · To Pay · Clarification Raj · 98xxxx3210 · **GPS on save** | Map: full card order; search finds FR-2026-12, 44821, MH12AB1234, ABC, Indore, Mumbai |
| B | `outward_freight_details` | To: Pune only · Bill B-9 · **no GPS** | Calendar snippet `Pune · Bill B-9`; **no map pin**; search finds B-9, Pune |
| C | `outward_freight_details` | From + To + LR only (no bill, vehicle, transporter, type, clarification) | Map/card: `From → To` + `LR …` only; no empty rows |
| D | `material_dispatched` | Dispatch: Plant A · Destination: Nagpur · Challan IC-88 · LR 9001 · Vehicle GJ01XX · Transporter XYZ · qty · **GPS** | Map intel: route + Challan + LR + vehicle line; no freight type row |
| E | `material_dispatched` | Party + material + destination text only · **no GPS** | Calendar list shows destination in snippet; no pin |

#### Observed behaviour (code review / typecheck)

- **Full (A):** All lines render in map card; calendar snippet collapses to ~2 lines with `·` separators.
- **Partial (B,C):** Only non-empty segments appear; no `undefined`/`null` labels.
- **Cluster:** Two freight records same GPS bucket → shared header from first available Origin → Delivery; per-row meta without repeated route.
- **`npm run typecheck`:** PASS after QA pass.

#### Limitations

- No geocoding of manual “delivery location” / “destination” text — pins require explicit GPS attachment on the record.
- Map clustering is coordinate bucketing (~11 m), not address-aware merging.
- Clarification mobile in search is last-4 only (global search privacy rule); full number remains on entry detail / share flows.
- Freight type row only on `outward_freight_details`, not material dispatch.
- Hindi labels for bill/challan/boxes counters; route text is user-entered (may be English).

**Screenshots:** Not captured in repo — verify on device/simulator with records A–E above.

### India PIN Code Intelligence (2026-05-31)

**Goal:** MSME users enter a 6-digit PIN → district/state/locality prefilled; optional godown/site name; no live tracking; save works if lookup fails.

**Resolver:** `src/services/location/pincodeResolver.ts` — `INDIAN_PIN_REGEX` / `isValidIndianPincode()` (6 digits, first digit 1–9), `normalizeIndianPinInput()`, `resolveIndianPincode()`. Order: in-flight dedupe → SQLite `pincode_cache` (90-day TTL, schema v2) → **offline** `india-pincode/browser` (jsDelivr gzip DB) → optional `EXPO_PUBLIC_PINCODE_API_URL` or `api.postalpincode.in` (response is a **JSON array**; TLS on default host may fail) → manual fallback. No user id in requests; PIN keys redacted in production logs.

**Data model:** `IndianPostalLocation` in `src/domain/indianPostal.ts`; optional on payloads: `dispatchFromPostal`, `deliveryToPostal` (freight + dispatch), `receivedAtPostal`, `supplierPostal` (material received), `partyPostal` (payment). Legacy strings `deliveryLocation`, `destination`, etc. still written for old readers/search.

**Forms:** `PostalLocationSection` + `useIndianPincodeField` — debounced lookup after 6 digits, success/fail chips, multi-locality chips, PIN-change alert if user edited fields. Freight/dispatch: Dispatch from + Delivery to. Material received: Received at + optional supplier PIN. Payment: optional “Add party location” toggle.

**Map / calendar / search:** `freightDispatchMapIntel` lines use `From:` / `To:` + postal formatting; search indexes PIN, locality, district, state, place name, bill/challan. **Map pins still GPS-only** (`buildMapMarkerRecords` unchanged).

**PDF:** `formatPdfPostalLine` — compact `Place, District, State - PIN` in freight/dispatch rows.

#### Manual test matrix (device)

| PIN | Case | Expected |
|-----|------|----------|
| `324001` | Valid (Kota, Rajasthan) | Resolving chip → success; district/state/locality filled; editable; save OK |
| `000000` | Invalid format (leading zero) | Invalid PIN chip before lookup; manual entry still allows save |
| Airplane mode + `281403` | Offline, never cached, DB not warmed | Lookup fails; manual fields; save OK. After one online lookup, cache + in-memory DB cover repeats |
| Change PIN after edit | UX | Alert: keep edits vs update from new PIN |

**Limitations:** Third-party PIN API is client-side today (isolated in resolver for future backend move). No geocoding / approximate map pin from PIN. Old records without `*Postal` fields keep working via legacy location strings only.

### At-a-Glance detail pages (2026-05-31)

**Routes:** `/(app)/at-a-glance/today`, `this-week`, `upcoming` — linked from You stat tiles (no longer diary/calendar).

**Service:** `src/services/dashboard/atAGlanceService.ts` loads diary + letterhead + pro packs via repositories, returns `AtAGlanceViewModel` sections. UI: `app/(app)/at-a-glance/[view].tsx`, `AtAGlanceRow`, `useAtAGlanceDetail`.

**+ New rule:** No header CTA when data exists. Empty state only shows `PremiumNewRecordButton` (opens You tab for composer picker).

**Today sections:** dueToday, followupsToday, dispatchFreight, payments, staffWork, materials, gstCompliance, documents, createdToday.

**This week sections:** pendingFollowups, payments, freight, purchasesMaterials, staffWork, gstEmail, letterheadDocuments (rolling 7 days, date on each row).

**Upcoming sections:** overdue → today → tomorrow → this_week → later; actionable dates only (reminders, dues, deliveries, GST due, settlement); settled/archived excluded unless future reminder.

**Manual test:** Create sample payment (party + invoice + due), freight (bill + destination), material dispatch, staff note, GST reminder — verify grouping, tap → diary detail, empty states without top + New.

### Global Business Search (2026-05-31)

**You dashboard:** `GlobalSearchBar` below `UserGreetingHeader`, above banners/stats. Tapping opens `/(app)/search` (full-screen; no inline results on You).

**Files added/changed**

| Path | Role |
|------|------|
| `src/components/search/GlobalSearchBar.tsx` | Premium glass/gradient affordance on You tab |
| `src/components/search/SearchFilterChips.tsx` | Filter chips (All, Records, Payments, …) |
| `src/components/search/GlobalSearchResultRow.tsx` | Memoized result row + icon |
| `app/(app)/search.tsx` | Debounced search UI, SectionList, recent queries/records |
| `src/hooks/useGlobalSearch.ts` | 320ms debounce, min 2 chars, filter state |
| `src/services/search/*` | Normalize, index build, match, repository, routing, recent queries |
| `app/(app)/(tabs)/you.tsx` | Embeds `GlobalSearchBar` |
| `src/i18n/locales/en.ts`, `hi.ts` | `globalSearch.*` strings |
| `src/services/diary/localFirst.ts` | `notifySearchIndexChanged()` after synced create/update |

**Search normalization:** NFKC Unicode → `toLocaleLowerCase('en')`, collapse whitespace, token AND-match; digit-stripped matching for amounts (`2,00,000` / `200000`), invoice/LR numbers; Hindi text preserved through Unicode normalization (not transliterated).

**Searchable fields by record type (via `buildEntrySearchableText` + indexers)**

- **All diary entries:** title, notes, UEID, status, source, location, reminder note, dates, attachments names, `documentHistory` (PDF versions, edit field names, summaries).
- **payment_request:** party, invoice #, contact, note, pending amount (raw + locale digits); bank holder/name/instruction only — **no account # / IFSC / UPI in index**.
- **outward_freight_details:** bill/LR, locations, transporter, vehicle, party, material, dispatch title, clarification name, mobile **last 4 only**.
- **business_cash_given:** amount variants, given-to, purpose, mobile last 4.
- **material_***: party/supplier, material, qty, invoice/challan/LR, vehicle, transporter, locations, remarks.
- **staff_matter:** name, details, type, action.
- **reminder_*:** item/subject/GST period/return type (+ gstr-3b aliases), vendor, email fields.
- **letterhead_matter:** subject, body, reference, signer, place.
- **legacy:** category, issue, tags, location.
- **LetterheadDocument:** title, subject, body, signer, place, date.
- **ProfessionalServicePack:** title, category, matter type, facts values, professional name, contact last 4.
- **PDF history rows:** extra index rows per `pdfGenerationHistory` entry → routes to parent diary entry.

**Result UI:** SectionList grouped by category label; row shows type label, title, sanitized snippet, date, MaterialCommunityIcons icon.

**Routing:** `navigateToSearchResult` → diary `[id]`, letterhead history, professional-pack `[id]`, PDF hits → parent record detail.

**Privacy:** Search queries are **never logged**. Snippets mask 6+ digit sequences; full mobiles/bank numbers excluded from index/snippets.

**Performance:** In-memory index cached per user until `invalidateGlobalSearchIndex()`; reload on search screen focus; repository `list()` only (no raw SQLite/AsyncStorage from screens). FlatList/SectionList + memoized rows; no blur in rows.

**Manual test queries:** `SLFY2526`, `0014`, `KOTA`, `Manoj`, `200000`, `2,00,000`, `GSTR-3B`, `GST`, sample LR/invoice/party names from seed data.

**Limitations / future**

- No SQLite FTS or Firestore server search yet — structure allows adding `searchCloudProvider` later.
- Pending offline-only entries not in diary repo may be missing until sync.
- Letterhead doc tap opens history list (no per-doc detail route yet).
- `notifySearchIndexChanged` wired on local-first diary save only; letterhead/pro-pack deletes should call it when those flows are centralized.

### Route conventions

- All routes use the shared `<Screen>` primitive (handles SafeArea, keyboard
  dismiss, scroll vs flex).
- Headers use the shared `<Header title subtitle showBack rightSlot>` component.
- Back navigation falls back to `/dashboard` if no back history.
- Navigation between routes uses `useRouter()`. Pass params via
  `router.push({ pathname, params })`.

---

## 11. UI System & Design Tokens

### Tokens (`src/theme/`)

- **colors.ts** — palette. Primary is deep indigo `#3B41C5`. Background white.
- **spacing.ts** — `xs/sm/md/lg/xl/xxl/xxxl` (4 / 8 / 12 / 16 / 24 / 32 / 48).
  Plus `radius` (sm/md/lg/xl/pill).
- **typography.ts** — `displayLg/displayMd/titleLg/titleMd/titleSm/body/
  bodyStrong/caption/captionStrong/micro/mono`. Mono is used only for UEID
  display.

### Primitives (`src/components/ui/`)

| Component | Notes |
|---|---|
| `<Button>` | Variants: primary / secondary / ghost / danger. Sizes: md / lg. `loading`, `disabled`, `leftSlot`. |
| `<TextField>` | RHF-compatible. Has label/hint/error states, left/right adornments, multiline. |
| `<Card>` | Optional `onPress` (renders Pressable). White surface, indigo ripple on Android. |
| `<Screen>` | SafeAreaView + StatusBar + optional scroll (`keyboardDismissMode="on-drag"`, no Pressable wrap) + `tabBarInset` / `fixedChildren` for tab screens + FABs. |
| `<Header>` | Title/subtitle, optional back button, optional `rightSlot`. |
| `<Banner>` | Tones: info / warning / danger / success. Title + message. |
| `<EmptyState>` | Icon-circle, title, message, optional CTA button. |
| `<ErrorState>` | Error title, message, optional retry. |
| `<Loader>` | ActivityIndicator + optional message + fullscreen variant. |
| `<Pill>` | Used for category chips/filters. |

### Diary-specific components (`src/components/diary/`)

- `<EntryRow>` — Card with title, category tag, location, 2-line notes preview.
- `<EntryForm>` — Used by both Add and Edit. Title, category picker,
  date pills, location, notes, quantity, issue, tags. Primary + optional
  secondary submit button. Surfaces a `<Banner tone="danger">` on save error.
- `<CategoryPicker>` and `<CategoryFilter>` — horizontal scrolling pill rows.

---

## 12. Validation, Errors, Logging

### Validation — `src/utils/validation.ts`

Zod schemas:

- `phoneSchema` — `mobile: /^[6-9]\d{9}$/`, `consent: true`.
- `otpSchema` — `code: /^\d{6}$/`.
- `entrySchema` — title (1-120), category enum (11), entryDate positive int,
  notes (≤ 5000), location (≤ 120), quantity (≤ 60), issue (≤ 500),
  tags (≤ 10 strings ≤ 30 chars each).

**Zod 4 gotcha (preserved):** I removed `.default()` from `entrySchema`
because in Zod 4 `.default()` makes the *input* type include `undefined`
while keeping the *output* type required, which breaks RHF's `Resolver<T>`
generic. The `EntryForm` provides explicit `defaultValues` instead.

### Errors — `src/domain/errors.ts`

```ts
export type AppErrorCode =
  | "network" | "invalid_phone" | "invalid_otp" | "otp_expired"
  | "too_many_attempts" | "auth_not_configured" | "session_expired"
  | "not_found" | "permission_denied" | "save_failed" | "delete_failed"
  | "unknown";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly cause: unknown;
}
```

Always throw `AppError` from services. Screens call `userFacingMessage(e)`
to get a human string for banners. Never display raw exceptions.

### Logger — `src/utils/logger.ts`

```ts
const log = createLogger("auth/mock");
log.info("startOtp", { phone: phoneE164 });
```

Auto-redacts keys named `otp`, `code`, `verificationCode`. Mobile numbers
are masked to `XXX***XX`. Debug logs are suppressed in production. Use
this — never `console.log` raw sensitive data.

---

## 13. Security, Privacy, Firestore Rules

### `firestore.rules`

```
match /users/{uid}                       — owner-only read/write; UEID is immutable
match /users/{uid}/entries/{entryId}     — owner-only; create requires userId == uid; no client delete
match /phoneIndex/{phone}                — DENY ALL client access (server-only)
match /ueidIndex/{ueid}                  — DENY ALL client access (server-only)
```

In a strict production setup, move profile / phoneIndex / ueidIndex writes
behind a Cloud Function so clients can't fabricate UEID claims even with
write access to `users/{uid}`. This is documented in the README too.

### Privacy posture

- OTP codes never logged in production (and masked in dev).
- Full mobile numbers never logged.
- Session in SecureStore (Keychain / EncryptedSharedPreferences); falls
  back to AsyncStorage on web (where SecureStore is unavailable).
- No third-party SDKs beyond Firebase.
- No analytics, no surveillance, no geo, no KYC.

### PDF privacy & trust architecture (2026-05-31)

**Audit (before changes)**

| Question | Finding |
|----------|---------|
| Where generated? | `pdfService.generate()` → `expo-print` `printToFileAsync` on device (`src/services/pdf/pdfService.ts`). Templates: `businessEntryPdfTemplate`, `letterheadPdfService`, `professionalPackPdfTemplate`. |
| Where stored? | `file://` URI on device (`entry.pdfUri`, letterhead doc `pdfUri`, pack `pdfUri`). SQLite cache may hold full entry JSON locally including `pdfUri`. |
| Firebase Storage upload? | **No** — no `firebase/storage` usage in app source. |
| PDF HTML logged? | `pdfService` logged only `fileNameHint`; global logger redacts `pdf`/`html` keys and long HTML strings. |
| PDF in Firestore? | **Not the file.** Structured entry/pack/letterhead **input** may sync; `pdfUri` was previously written to Firestore on entry update — **now stripped** via `entryToCloudStorage` / `packToCloudStorage` / `letterheadDocToCloudStorage`. |
| Metadata in Firestore? | `documentHistory` (timestamps, version) syncs with entries. |
| Share/export? | **Yes** — `expo-sharing` native share sheet (`pdfService.share`). |
| Admin PDF browser? | **None** in codebase. |

**Policy implemented**

1. Local-first PDF files; cloud backup **OFF** (`PDF_CLOUD_BACKUP_ENABLED = false`).
2. No automatic PDF upload; sync queue no longer sends `pdfUri` (`syncEngine.ts`).
3. Firestore writes null `pdfUri` (`src/services/pdf/pdfCloudSync.ts`).
4. Logger + `pdfSafeLog.ts` block PDF HTML / sensitive keys in logs.
5. **Settings → PDF Privacy** (`app/(app)/settings/pdf-privacy.tsx`) + `src/constants/pdfPrivacy.ts` i18n keys.
6. Optional cloud backup toggle shown **Coming soon** (disabled).
7. Future modes documented: local-only / cloud-backed / encrypted (zero-knowledge needs client-held keys).
8. Legal/About copy: `legal.privacyPdfLocal|Sync|Share` — honest access wording (we do **not** claim “cannot access” without E2E encryption).

**Can SPECIAL SOFTWARES access PDFs technically?**

| Data | Access |
|------|--------|
| PDF file on user's phone | Only on-device unless user shares via OS sheet |
| PDF bytes on our servers today | **No** (not uploaded) |
| Firestore entry text (notes, bank fields in payload) | **Yes** when Firebase sync enabled — this is user-typed record data, not the PDF binary |
| Letterhead template image (base64 in Firestore config) | **Yes** in cloud mode — template, not generated PDF |

**Remaining for zero-knowledge cloud PDF backup:** client-side encryption, key never sent to server, separate `PDF_STORAGE_MODE.CLOUD_ENCRYPTED` pipeline, Admin SDK policy audit.

### Mobile → UEID identity lifecycle (P0 — audited 2026-06-02)

**Rule:** One verified mobile number → at most one **active** account/UEID. Same active mobile on any device returns the same profile. Pending deletion blocks login/new registration. After deletion completes, same mobile may register **fresh** (new UEID, no old records).

#### Canonical states

| Layer | Values | Stored |
|-------|--------|--------|
| Account | `active`, `pending_deletion`, `deleted` | `users/{uid}.status` (+ legacy `deletedAt`) |
| UEID index | `active`, `retired` | `ueidIndex/{ueid}.status` / `retired: true` |
| Phone index | E.164 → `uid` | `phoneIndex/{phoneE164}` (Firestore) or `registry.phoneIndex` (mock) |
| Retired phone tombstone | — | `retiredPhones/{phone}`, `vyd_retired_phones_v1` (local) |

**Profile fields:** `mobileHash` (FNV-1a of normalized E.164), `deletionRequestedAt`, `deletionScheduledFor` (request + **15 days**), `deletionCompletedAt`, `retiredUeid`.

#### Lookup flow (`confirmOtp` / `resolveOrCreateUser`)

1. Normalize phone → `phoneIndex` / mock `phoneIndex`.
2. **Active** → return existing UEID/profile (never mint duplicate).
3. **`pending_deletion`** → block login → `app/(auth)/account-pending-deletion` (cancel allowed). If grace elapsed → `finalizeDeletionIfDue()` then fresh registration.
4. **`deleted` / retired phone** → do not restore; `phoneIndex` removed; fresh UEID via registry-backed `generateUEID()` + `ueidIndex` reservation (skips `retired` slots).
5. **No index** → create account; production uses **random** UEID + transaction (not `deriveUEIDFromPhone`).

#### UEID policy

| Backend | Allocation | Re-login after deletion |
|---------|------------|-------------------------|
| **firebase-production** | `allocateUeidInTransaction()` — random, `ueidIndex` reserved | Fresh random UEID; old UEID `retired` |
| **firebase-shared-dev** | Same as production when phone retired; dev uid still `deriveMockUidFromPhone` | `generateUEID()` + `ueidIndex` when `retiredPhones` hit |
| **local-mock** | `deriveUEIDFromPhone` for first issue; `generateUEID()` when phone retired | `phoneIndex` + tombstone; **reinstall clears local tombstone** (dev-only caveat) |

**Bugs fixed in this pass:** `pending_deletion` was never written (instant delete only); boot did not revalidate status; mock migration overwrote stored UEID with deterministic hash; shared-dev had no `ueidIndex` collision check; login error for pending was generic “deleted”.

#### Deletion lifecycle

| Phase | Behaviour |
|-------|-----------|
| **Request** | `requestAccountDeletion()` → `status: pending_deletion`, `deletionScheduledFor`, keep `phoneIndex`; sign out; **no local purge yet** |
| **Grace (15d)** | Login shows pending screen; **Cancel deletion** restores `active` |
| **Complete** | `completeAccountDeletion()` / `finalizeDeletionIfDue()` → purge local SQLite/AsyncStorage, delete `phoneIndex`, retire `ueidIndex`, anonymize user, `retiredPhones` tombstone |

**UI:** `settings/delete.tsx` (grace copy, PDF cannot be recalled); `account-pending-deletion.tsx`; OTP routes `account_pending_deletion` error.

**Honesty:** Local-mock = device-only scope. Firebase = best-effort client erasure (`firebaseServerDeletion.ts`); may return `serverDeletion: pending` — do not claim full server purge until Admin SDK/Cloud Function runs.

**Production blockers:** Native OTP still unwired in `firebase.ts` (`auth_not_configured`); recursive Firestore delete + strict `phoneIndex` rules need **Cloud Functions / Admin SDK**; scheduled deletion completion without user opening app needs server cron.

---

## 14. Known Limitations & Integration Seams

| # | What | Where | What to do |
|---|---|---|---|
| 1 | Native phone OTP unwired | `src/services/auth/firebase.ts` (two TODO seams in `startOtp` / `confirmOtp`) | Add `@react-native-firebase/auth` or a custom SMS provider; call `verifyPhoneNumber`/`signInWithCredential`; then call exported `__firebaseAuthInternals.resolveOrCreateUser(uid, phone)` to get a fully resolved profile. |
| 2 | Diary list filters in memory | `src/services/diary/firebase.ts → list()` | For large datasets, switch to `where('deletedAt', '==', null)` + composite indexes. Create the indexes in Firebase console. |
| 3 | Profile screen shows cached `joined` from session, not Firestore profile | `app/(app)/profile.tsx` | If you start mutating profile (e.g. `displayName`), fetch the live `UserProfile` from Firestore on screen mount. |
| 4 | No push notifications, no photo attachments, no draft-on-quit | various | Out of V1 scope. If added later, do so behind feature flags so the golden flow stays small. |
| 5 | Expo Go SDK 56 unavailable on iOS App Store | n/a — project is on SDK 54 | If/when Expo Go SDK 56 ships on the App Store, you can re-upgrade with `npx expo install expo@~56 && npx expo install --fix`. |
| 6 | `expo-haptics` is installed but unused | `package.json` | Either start using it (e.g. on save), or remove the dep. |
| 7 | Web build not configured | `app.json` has `"web"` block | Add `npx expo install react-native-web @expo/metro-runtime` if web support is desired. |
| 8 | No tests yet | n/a | None of the services/utils have tests. UEID generator, phone normalizer, mock auth, and mock diary are the highest-value test targets. |

---

## 15. Session History — What Already Happened

So you don't repeat work or re-make decisions that were already debated:

### Build session (2026-05-30)

1. **Scaffolded** with `create-expo-app … --template blank-typescript`. Picked
   up Expo SDK **56** initially. Removed boilerplate `App.tsx` / `index.ts`,
   switched `main` to `expo-router/entry`.
2. **Disk space crisis.** User's machine had only ~370 MiB free; couldn't
   install deps. With explicit user consent, deleted
   `~/Library/Developer/Xcode/UserData/Previews` (1.3 GB SwiftUI preview
   cache, regenerated by Xcode on demand) → freed 8 GB.
3. **Installed deps** via `npx expo install` + `npm install --legacy-peer-deps`
   (Firebase needs the flag).
4. **Built the full V1**: design tokens, UI primitives, domain types, auth
   abstraction, UEID system, diary repository, session store, validation,
   logger, share util, all 14 screens, security rules, README.
5. **Project layout flatten** (user request). Moved everything from
   `vyaamikk-diary/` subfolder up into the workspace root so
   `npm run start` works without a `cd`. Updated README references.
6. **Expo Go incompatibility on iPhone.** User's App Store Expo Go is pinned
   to SDK 54 (Expo deliberately doesn't ship SDK 55/56 to App Store).
   Discussed options:
   - A: Downgrade to SDK 54 ← user picked this
   - B: TestFlight Expo Go beta
   - C: Android device
   - D: EAS dev build (requires Apple Developer Program)
7. **Downgraded SDK 56 → 54.** Edited `package.json`, ran clean install,
   `npx expo install --fix` aligned all expo-* and RN versions. Added
   `.npmrc` (`legacy-peer-deps=true`) so `expo install`'s internal
   `npm install` works. Added `metro.config.js` (SDK 54 doctor check
   requires it).
8. **Infinite-loop fix.** The `useDiaryList` hook was returning raw
   `() => fetchOnce(…)` functions on every render. Combined with
   `useFocusEffect(useCallback(() => void reload(), [reload]))` in
   Dashboard and Diary History, the changing `reload` identity caused
   `useFocusEffect` to re-run the callback while focused, which called
   `setState`, which re-rendered, which created a new `reload`, etc.
   Fix: wrapped `refresh` and `reload` in `useCallback([fetchOnce])`
   and added an inline comment explaining the trap. **Do not undo this.**

### Decisions made (and why)

- **Mock auth path is built into the production code, not a test fixture.**
  This is intentional — it's the only way to ship a fully-working app for
  reviewers and field tests without a live SMS gateway. The mock has a clear
  "development" gating banner on the OTP screen.
- **UEID alphabet excludes 0/O/1/I/L.** Operators reading IDs out loud over
  phone calls is a real MSME workflow.
- **Soft delete for everything.** Hard delete is a backend-side concern that
  requires data-retention policy decisions outside this codebase.
- **No multi-product ecosystem screen.** Even though the UEID is "the first
  of SPECIAL SOFTWARES IDs," V1 deliberately stays a single-product app per
  product brief. Future products can simply read the same registry.

### Business Entry Composer (2026-05-31)

**You `+` flow** now opens exactly **9 business-purpose options** (no generic
categories / no “Other”). Each creates a **structured `BusinessEntry`** with
shared fields (`id`, `userId`, `ueid`, `entryType`, `title`, `entryDate`,
`source`, `status`, `notes`, `reminder`, `location`, `attachments`, `payload`).

| `entryType` | Route | PDF |
|---|---|---|
| `letterhead_matter` | Letterhead module (body required before PDF) | Letterhead PDF + diary link |
| `work_update_issue` | `/composer/work_update_issue` | Work Update Report |
| `staff_matter` | `/composer/staff_matter` | Staff Matter Note |
| `business_cash_given` | `/composer/business_cash_given` | Cash Paid Record |
| `material_dispatched` | `/composer/material_dispatched` | Dispatch Record |
| `material_received` | `/composer/material_received` | Receipt Record |
| `reminder_purchase` | `/composer/reminder_purchase` | Purchase Reminder |
| `reminder_email` | `/composer/reminder_email` | Email Reminder |
| ~~`reminder_gst_return`~~ | *(removed)* | Use **Statutory Information** tab instead of diary GST filing reminders |

**Key files:** `src/domain/businessEntry.ts`, `src/domain/composerOptions.ts`,
`src/utils/businessEntry/{validation,payload,display}.ts`,
`src/components/composer/BusinessComposerForm.tsx`,
`app/(app)/composer/[type].tsx`, `src/services/diary/normalize.ts`,
`src/services/pdf/businessEntryPdfTemplate.ts`.

**Legacy V1 entries** deserialize as `entryType: "legacy"` with `LegacyPayload`.
History filters by `entryType`; search uses `entrySearchBlob()`.

**Known limitations:** Some entry types still lack composer edit; Cash Paid
supports edit via `/composer/business_cash_given?editId=…` with audit trail.
Photo attachments field exists on model but picker not wired in composer forms
yet. Cash “mark settled” is via `status` on model — no dedicated UI button yet.

### Cash Paid record — dates, audit, PDF (2026-05-31)

High-trust **Cash Paid** (`business_cash_given`) with separate system vs user
dates, 30-day cash-paid window, immutable edit/PDF history, and PDF Document
History only after edits.

#### Files changed

| Area | Path |
|---|---|
| Date window + validation | `src/utils/businessEntry/cashPaidDate.ts`, `cashPaidDate.test.ts` |
| Zod + field order | `src/utils/businessEntry/validation.ts`, `composerFieldOrder.ts` |
| Payload / form mapping | `payload.ts`, `formValuesFromEntry.ts` |
| Composer UI | `BusinessComposerForm.tsx`, `ComposerDateField.tsx`, `ComposerRecordedOnField.tsx`, `app/(app)/composer/[type].tsx` |
| Detail + search + normalize | `BusinessEntryDetailBody.tsx`, `buildSearchableText.ts`, `normalize.ts` |
| Audit + PDF | `src/services/documentHistory/index.ts`, `businessEntryPdfTemplate.ts`, `pdfLayout.ts` |
| Local update audit | `src/services/diary/localFirst.ts` (uses `mergeBusinessEntryUpdate`) |
| i18n | `src/i18n/locales/en.ts`, `hi.ts` |

#### Two dates (storage vs UI)

| Concept | UI label | Storage |
|---|---|---|
| System record time | **Recorded on** (read-only) | `BusinessEntry.createdAt` — set on first save, never editable in composer |
| Actual cash paid day | **Cash paid date** (picker) | `payload.paymentDate` (normalized local noon); `entryDate` mirrors this for calendar/search |

Legacy rows without `payload.paymentDate` fall back to `entryDate` on read
(`normalize.ts`, `formValuesFromEntry.ts`, detail body). Viewing old dates
outside the 30-day window is allowed; **new** saves and **changed** cash paid
dates must pass validation (`validateCashPaidDateForSave` preserves unchanged
legacy `paymentDate` on edit).

#### Date validation

- Shared utility: `cashPaidDate.ts` — `date-fns` `startOfDay` / `subDays` on
  **local calendar** days (avoids UTC “yesterday/tomorrow” bugs).
- Window: today through today − 30 inclusive (`CASH_PAID_LOOKBACK_DAYS = 30`).
- Enforced in: `ComposerDateField` `minimumDate`/`maximumDate`,
  `buildCashGivenSchema()` superRefine, and `buildPayload` normalization.
- Error i18n keys: `composer.cashPaidDateRequired`, `cashPaidDateFuture`,
  `cashPaidDateTooOld`.

#### Edit history (immutable)

- Service layer: `applyBusinessEntryEditAudit` in
  `src/services/documentHistory/index.ts` (via `mergeBusinessEntryUpdate`).
- Screens do not write `documentHistory` directly.
- Each edit appends `editHistory[]` with `editedAt`, `versionNumber`,
  `fieldNames`, `previousSummary`, `newSummary`; bumps
  `documentHistory.versionNumber` and `lastEditedAt`.
- Cash diffs dedupe `entryDate` when `paymentDate` also changed.
- Users cannot delete or hide history in UI/PDF.

#### PDF behaviour

- Title: **Cash Paid Record**.
- Order: profile header → **Document History** (only if `editHistory.length > 0`)
  → details (cash paid date, recorded on, amount INR, paid to, purpose, payment
  mode Cash, settlement if not pending).
- No duplicate generic `entryDate` meta row for cash.
- `recordPdfGeneration` sets `firstGeneratedAt` on first PDF, updates
  `lastGeneratedAt`, appends `pdfGenerationHistory`.
- Narrative block: `pdfDocumentHistoryHtml` + `.pdf-document-history-narrative`
  CSS in `pdfLayout.ts`.
- Footer disclaimer only in page footer (no body watermark).

#### Existing records

- No migration corruption: missing `paymentDate` → use `entryDate`.
- Old cash paid dates outside 30 days: view OK; edit keeps date unless user
  changes it to an invalid day.
- `createdAt` unchanged on edit (Recorded on stays truthful).

#### Manual validation checklist

| Case | Expected |
|---|---|
| Today | Save OK |
| Yesterday | Save OK |
| Exactly 30 days ago | Save OK |
| 31 days ago (new/change) | Inline error, save blocked |
| Tomorrow / any future | Inline error, save blocked |
| Double-tap save | Single save (composer guard unchanged) |
| After validation error | Typed values preserved |
| After save | Success sheet (View / PDF / Share / Add another / Dashboard) — no forced You redirect |

Run automated date assertions: `npm run test:cash-date`.

#### Manual PDF test (edit history)

1. Create Cash Paid for today → save → Generate PDF (note `firstGeneratedAt`).
2. Edit amount or purpose → save.
3. Regenerate PDF → top **Document History** block, e.g. first generated time,
   last edited time, version 2, changed fields (Amount, Purpose).
4. Confirm Recorded on in PDF still matches original `createdAt`.

### Record Timeline & Date Governance (2026-05-31)

Centralized **business date policies** for all `+ New Record` composer types.
System **`createdAt` / Recorded on** remains app-generated and non-editable;
user-facing event/reminder dates follow per-type windows. Existing saved rows
are never migrated or hidden; validation applies to **new** saves and **changed**
dates only (unchanged legacy calendar day passes on edit).

#### Files changed

| Area | Path |
|---|---|
| Policy service | `src/services/recordDatePolicy/` (`recordDatePolicyService.ts`, `calendar.ts`, `gstDueDateGuide.ts`, `index.ts`) |
| Zod refine helper | `src/utils/businessEntry/datePolicyRefine.ts`, `datePolicyFromEntry.ts` |
| Schemas | `src/utils/businessEntry/validation.ts` (builders per type + `DatePolicySchemaOptions`) |
| Cash shim | `src/utils/businessEntry/cashPaidDate.ts` (delegates to policy service) |
| Composer UI | `BusinessComposerForm.tsx`, `ComposerDateField.tsx`, `ComposerRecordedOnField.tsx`, `PaymentRequestFields.tsx`, `OutwardFreightFields.tsx`, `ReminderFields.tsx`, `composerFieldOrder.ts` |
| Screen | `app/(app)/composer/[type].tsx` (`editMeta` + `datePolicyOptionsFromEntry`) |
| i18n | `src/i18n/locales/en.ts`, `hi.ts` (`datePolicy.*`) |
| Messages | `src/utils/i18n/translateFormMessage.ts` |

#### Policy service design

- **`validateRecordDate(policyId, ms, { existingMs })`** — local calendar-day
  compare via `date-fns` `startOfDay` (no UTC drift).
- **`getRecordDatePickerBounds(policyId)`** — min/max `Date` for pickers.
- **`policyForField(entryType, field)`** — maps form fields to policies.
- **`recordDatePolicyMessageKey`** → `datePolicy.errors.{policyId}.{code}`.

| Policy ID | Rule | Fields / types |
|---|---|---|
| `cash_paid` | Today − 30 … today | `paymentDate` / Cash Paid |
| `payment_request_created` | Today only (non-editable UI) | `entryDate` / Payment Request |
| `supporting_past_optional` | ≤ today (optional) | PR `invoiceDate`, `dueDate` |
| `event_past_15` | Today − 15 … today | `entryDate` work/staff/material dispatch/receipt |
| `freight_event` | Today ± 15 | `billDate` (or `entryDate` if no bill date) / Freight |
| `reminder_future_3m` | Today … today + 3 months | `reminder.at` purchase/email; work follow-up |
| ~~`gst_due_future_3m`~~ | *(removed with GST filing reminder composer)* | GST due dates → **Statutory Information** |

#### GST due dates (diary vs statutory)

- **+ New record** no longer offers a GST filing reminder composer (removed 2026-05-31).
- Standard GST/TDS/IT due dates live in **Statutory Information** (`statutoryInfoRegistry.ts`).

#### UI + save validation

- Pickers: `minimumDate` / `maximumDate` from policy service.
- Save: Zod `superRefine` via `refineRecordDatePolicy`; banner + scroll/focus
  first invalid field (`firstComposerFieldError`); form data preserved.
- Payment Request: read-only request date + **Recorded on** when editing;
  `entryDate` forced to today on new save transform.

#### Existing records

- `datePolicyOptionsFromEntry()` supplies `existing*Ms` per field on edit.
- Unchanged calendar day outside current window still saves (same as Cash Paid).
- View/export/PDF/search/calendar unchanged for old dates.

#### PDF / detail dates

- Cash Paid PDF unchanged (Recorded on + Cash paid date + Document History on edit).
- Other types: continue using `entryDate` / payload dates for calendar/search;
  detail screens should show **Recorded on** (`createdAt`) where `recordCreatedAtMs` is passed.

#### Manual test matrix

| Type | Try | Expect |
|---|---|---|
| Cash Paid | 31d ago / tomorrow | Blocked; 30d window message |
| Payment Request | — | Request date today only; invoice date may be past |
| Staff / Work | 16d ago / tomorrow | Blocked; 15-day message |
| Freight | ±16d | Blocked; ±15 message |
| Material dispatch/receipt | Future / 16d ago | Blocked; 15-day past–today |
| Purchase / Email reminder | Yesterday | Blocked; today + 3 months |
| ~~GST reminder (diary)~~ | — | Removed from + New record; see Statutory Information |

`npm run test:cash-date` · `npm run typecheck`

### Statutory Information system (2026-05-31)

In-app **informational** statutory due-date layer (points **1–32 only**). No filing,
no CA/CS marketplace, no constitution onboarding. Conditional “If applicable…” wording.

#### Tab order

Calendar & Maps → You → **Statutory Information** → Settings (`app/(app)/(tabs)/_layout.tsx`).

#### Architecture

| Layer | Path |
|---|---|
| Domain | `src/domain/statutoryInfo.ts` |
| Registry (1–32) | `src/services/statutory/statutoryInfoRegistry.ts` |
| Due engine | `src/services/statutory/statutoryDeadlineEngine.ts` |
| Orchestration | `src/services/statutory/statutoryInfoService.ts` |
| Occurrence state | `src/repositories/statutoryInfoRepository.ts` + SQLite **V4** `statutory_occurrences` |
| Prompt session | `src/services/statutory/statutoryPromptSession.ts` (max one auto sheet / day) |
| UI | `StatutoryPromptSheet`, `StatutoryPromptHost`, `(tabs)/statutory.tsx`, `statutory/detail.tsx` |
| i18n | `src/i18n/locales/statutoryEn.ts`, `statutoryHi.ts` |

#### Reminder offsets

For each calculable due date: prompts on **7, 5, 3, and 1** days before (local calendar).
Dismissal is per offset (dismissing 7-day does not block 5-day). Consolidated scrollable
sheet when multiple items match; actions: **Ok thanks**, **Later today** (snooze ~evening),
**Open Statutory Information**.

#### Calendar

- Grey statutory dot on due dates (`CalendarMarkedDots.statutory`).
- Day list includes **Statutory information** section; tap → detail (not editable diary records).

#### Manual checks

1. Complete profile → open You tab → statutory sheet if due within window (once/day).
2. Dismiss → item in Statutory tab under Dismissed.
3. Snooze → no repeat until evening same day.
4. Calendar dot on GSTR-3B / advance-tax / LLP Form 11 dates.
5. EN/HI toggle on statutory strings.

`npm run test:statutory-dates` · `npm run typecheck`

#### Refinement — tab icon + compliance-period due dates (2026-05-31)

**Tab icon (old issue):** The statutory tab used a text `§` glyph that read like a dollar /
currency symbol and did not convey Indian MSME statutory compliance.

**Tab icon (new):** `StatutoryInfoTabIcon` — `file-document-outline` with
`shield-check-outline` badge (distinct from Calendar & Maps’ calendar + map-pin and You’s diary +
account). Communicates compliance filings / verified obligations — not money, government emblems,
or gavel imagery.
Route, label (**Statutory Information** / `statutory.tabLabel`), layout unchanged.

**Due-date bug (root cause):** `statutoryDeadlineEngine` treated the **reference calendar month**
as the return period and placed the due date in the **following** month (`period = ref month`,
`due = period + 1`). In June this produced **July 11 for “June period”** and skipped the active
cycle **May period → due 11 June**.

**Revised logic:** Monthly items use **compliance period = due month − 1** via
`generateMonthlyDueOccurrences()` / `getMonthlyCompliancePeriodForDueDate()`. Generation starts at
offset `−1` so the current month’s deadlines (e.g. May GSTR-1 due 11 Jun) are always included.
Display helpers: `formatCompliancePeriodLabel()`, `formatStatutoryPeriodLine()`,
`formatStatutoryDueLine()`, `formatStatutoryDueSubtitle()` in `statutoryCompliancePeriod.ts`.

**Examples verified (`npm run test:statutory-dates`, ref = 5 Jun 2026):**

| Item | Compliance period | Due date |
|---|---|---|
| GSTR-1 monthly | May 2026 | 11 Jun 2026 |
| GSTR-3B monthly | May 2026 | 20 Jun 2026 |
| TDS monthly deposit | May 2026 deductions | 7 Jun 2026 |

June-period GSTR-1 correctly appears as **11 Jul 2026** (not conflated with May period).

**Calendar & prompts:** Markers and SQLite occurrence keys remain on **actual due dates**
(`dueDateKey`). Card/sheet copy shows **period line + due line**; 7/5/3/1-day offsets,
consolidated sheet, dismiss/snooze/history unchanged.

**Configurable rules:** Due days and registry entries remain in
`statutoryInfoRegistry.ts` / `GST_DEADLINE_RULES` (and related config) so government
notification changes can be updated without UI rewrites.

| File | Change |
|---|---|
| `src/components/statutory/StatutoryInfoTabIcon.tsx` | Calendar + checklist icon |
| `src/services/statutory/statutoryCompliancePeriod.ts` | Period/due formatters |
| `src/services/statutory/statutoryDeadlineEngine.ts` | Period-based generation |
| `src/services/statutory/statutoryInfoService.ts` | `periodLine` / `dueLine` on VM |
| `src/domain/statutoryInfo.ts` | `periodLabel` on prompt cards |
| `app/(app)/(tabs)/statutory.tsx`, `StatutoryPromptSheet.tsx`, `statutory/detail.tsx` | Period + due UI |
| `src/i18n/locales/statutoryEn.ts`, `statutoryHi.ts` | `statutory.display.*` |
| `src/services/statutory/statutoryDeadlineEngine.test.ts` | June/May regression tests |

### P0 UX fix — scroll performance + iOS tab bar safe area (2026-05-31)

**Root causes identified:**

1. **`Screen` wrapped `ScrollView` in a full-screen `Pressable`** for
   keyboard dismiss. The pressable intercepted pan gestures → scroll felt
   stuck or laggy on tab and form screens.
2. **Bottom tab bar used a fixed `height: 64` / `paddingBottom: 10`** with no
   `useSafeAreaInsets()` → icons/labels overlapped the iOS home indicator.
3. **Tab screens lacked bottom content inset** — scroll content and the You
   FAB sat under the tab bar.
4. **List rows used `Card` drop shadows** (`shadowOpacity: 1` on every row) →
   expensive overdraw while scrolling diary/history lists.
5. **You/Calendar/Map fetched up to 500 diary entries** on focus for dashboard
   stats — unnecessary work on every tab visit.
6. **You FAB was inside the scroll tree** (absolute inside `ScrollView` content)
   plus a manual spacer hack.

**Fixes applied:**

| Area | Change |
|---|---|
| `src/layout/tabBar.ts` | `computeTabBarMetrics()` / `useTabBarMetrics()` — dynamic tab height + `contentPaddingBottom` (includes floating glass tab bar). |
| `src/theme/glass.ts` | Blur tints/intensities + Android translucent fallbacks. |
| `src/components/ui/GlassSurface.tsx` | `GlassSurface` (settings cards/segments) + `GlassTabBarBackdrop` (tab bar only). |
| `app/(app)/(tabs)/_layout.tsx` | Floating tab bar: `position: "absolute"`, `tabBarBackground` + `BlurView` on iOS. |
| `src/components/ui/Screen.tsx` | Scroll: no `Pressable` wrapper; `keyboardDismissMode="on-drag"`; `tabBarInset`, `extraBottomPadding`, `fixedChildren` (FAB outside scroll); Android `removeClippedSubviews`. |
| `src/components/ui/Card.tsx` | `elevated={false}` for list rows; lighter default shadow when elevated. |
| `src/components/diary/EntryRow.tsx` | `React.memo` + flat cards. |
| Tab screens | `tabBarInset` on Calendar / You / Settings (scroll passes under glass bar); Settings personalisation uses `GlassSurface`; You FAB via `footer`. |
| Lists | `FlatList` tuning on diary history + letterhead history; memoized `renderItem`. |
| Data limits | You dashboard fetch 80 (`youDashboardSummary`); Diary history paginated (80 + load more); Calendar/Map 1200 source limit unchanged. |

**Manual test checklist:** iPhone with home indicator (tab bar clearance, smooth
vertical scroll on You/Settings/Calendar); diary + letterhead history with 20+
rows; Android gesture nav; light/dark/system + EN/HI still switch correctly.

**Remaining performance risks:** Calendar `markedDates` still recomputes from up
to 200 entries; letterhead setup still renders a full A4 preview image in scroll
(large base64). Month-scoped diary queries would be the next scalability step.

---

## 16. How to Instruct Further Work

This section is for whoever (ChatGPT, Claude, another engineer) you ask to
make changes. Hand them this file and then issue commands like the examples
below. The agent should follow these rules:

### Rules for any agent extending this codebase

1. **Never call services directly from screens.** Always go through
   `useAuth()` / `useDiaryList()` / `getDiaryRepository()`.
2. **Never throw bare `Error`.** Throw `AppError(code, message)` from services.
3. **Never `console.log` sensitive data.** Use `createLogger(scope)`.
4. **Preserve UEID invariants** (see §6). If the change touches identity,
   read §6 first.
5. **Keep the mock and Firebase implementations in sync.** When you change
   `AuthService` or `DiaryRepository` contract, update both implementations
   in the same commit.
6. **Maintain `useDiaryList` stable callbacks.** Do not "simplify" them back
   to raw arrows.
7. **Run `npm run typecheck` and `npx expo-doctor` before declaring done.**
   18/18 doctor checks must pass.
8. **Avoid adding deps that are out of V1 scope** (see §1 "OUT of scope" list).
9. **Use the path alias `@/` for `src/`** in all new files.
10. **Use the UI primitives.** Don't recreate buttons / inputs / cards from
    scratch. If a new primitive is needed, add it under `src/components/ui/`
    and export from the barrel.

### Good prompts to give the next agent

These are examples that pair well with this handover.

- *"Wire native phone OTP using `@react-native-firebase/auth`. Replace the
  two integration seams in `src/services/auth/firebase.ts` (`startOtp` and
  `confirmOtp`). Don't change the AuthService interface or any screens."*
- *"Add an optional photo attachment to diary entries. Use `expo-image-picker`
  and Firebase Storage in prod, AsyncStorage base64 in dev. Extend
  `DiaryEntry`, `entrySchema`, `EntryForm`, the detail view, and Firestore
  rules. Do not change the search/filter contract."*
- *"Add a Cloud Function that hard-deletes a user 30 days after `deletedAt`
  is set. Output the function code and the rules updates required."*
- *"Add lightweight unit tests for `utils/ueid.ts`, `utils/phone.ts`, and
  `services/auth/mock.ts` (the registry contract). Use Jest. Wire into a
  new `npm run test` script."*
- *"Add a date picker to `EntryForm` using `@react-native-community/datetimepicker`
  so users can pick arbitrary dates, not just Today/Yesterday. Keep the
  pills as quick presets."*
- *"Re-upgrade to Expo SDK 56 now that Expo Go SDK 56 is on the App Store.
  Run `npx expo install expo@~56 && npx expo install --fix`. Re-add
  `react-native-worklets` if needed. Then re-verify `typecheck` and
  `expo-doctor` are green."*

### Bad / dangerous prompts to flag back to the user

- *"Connect to the Vyaamikk Samadhaan backend."* — violates §1 strategic
  constraint; refuse without explicit user confirmation that the constraint
  has changed.
- *"Generate UEIDs client-side without checking server uniqueness."* —
  violates §6 invariant. Always go through the resolve transaction.
- *"Allow users to change their own UEID."* — violates §6 invariant.
- *"Delete entries hard from the client."* — violates §13. Soft-delete only.
- *"Log the OTP / mobile for debugging."* — violates §13. Use the logger.

---

## Legal attribution, PDF footer, and You/Calendar UX (May 2026)

### Brand / legal constants

| Constant | Value | File |
|---|---|---|
| `APP_BRAND_NAME` | Vyaamikk Diary | `src/config/brand.ts` |
| `PUBLIC_BRAND` | SPECIAL SOFTWARES | `src/config/brand.ts` |
| `LEGAL_OPERATOR` | Ananya Engineered Industrial Components & Pay Systems LLP | `src/config/brand.ts` |

`src/config/env.ts` also exposes `brand.legalOperator` via `EXPO_PUBLIC_LEGAL_OPERATOR`.

**LEGAL_REVIEW_TODO:** Wording in `src/config/brand.ts`, `src/services/pdf/pdfLegalFooter.ts`, and `src/i18n/locales/en.ts` (`legal.*`) is product-protective boilerplate only. Qualified counsel should review before public launch. This does not eliminate operator liability for negligence, unlawful conduct, data breaches, or statutory obligations.

### About / Disclaimer / Terms screens

| Screen | Route |
|---|---|
| About (polished) | `app/(app)/settings/about.tsx` |
| Disclaimer / Legal Notice (in-app) | `app/(app)/settings/disclaimer.tsx` |
| Terms of Use (in-app) | `app/(app)/settings/terms.tsx` |

Settings tab links: About, Disclaimer, Terms (in-app), Privacy (URL), Terms (URL), Delete Account.

### PDF layout (all export templates — May 2026 unified pass)

**Shared modules**

| Module | Role |
|---|---|
| `src/services/pdf/pdfLayout.ts` | **`pdfUserProfileHeaderHtml()`** — compact “Vyaamikk User Profile” (name, business if set, Vyaamikk ID, optional logo). **`pdfFooterHtml()`** — single footer with all platform/legal metadata. **`buildPdfFooterLine()`** — exact footer text. **`pdfLayoutCss()`** — profile + footer styles. |
| `src/services/pdf/pdfPageStyles.ts` | A4 page + record body tables; imports `pdfLayoutCss()` |
| `src/services/pdf/userPdfBranding.ts` | `getUserPdfBranding()`; re-exports profile header |
| `src/services/pdf/pdfLegalFooter.ts` | Thin compat layer; `pdfDocumentMetaTableHtml()` **removed (returns empty)**; `pdfLegalFooterHtml()` delegates to `pdfFooterHtml()` |

**Structure (every template except letterhead)**

1. **Top:** Document title (`h1`) + **Vyaamikk User Profile** block only — no app name, operator, generated-by, or timestamp in the body.
2. **Body:** Record content only (entry/pack/legacy fields, notes, reminders).
3. **Footer (fixed, light grey #9CA3AF, 7.5pt):** One combined line + optional supplementary line (payment request only) + page number.

**Exact footer line (English, built by `buildPdfFooterLine()`):**

> Generated using Vyaamikk Diary by SPECIAL SOFTWARES | Operated by Ananya Engineered Industrial Components & Pay Systems LLP | User: {userName} | Vyaamikk ID: {ueid} | Generated at: {timestamp} | User-generated document; platform does not verify contents or become party to the underlying matter.

**Payment request** adds a second footer line (not in body): user-generated payment request clarification (not a legal notice / loan / recovery guarantee).

**Letterhead:** No top profile block (user template already has company identity). **No platform footer** on exported PDF (2026-06-03); other record PDFs still use `pdfFooterHtml()`.

**Duplicate sections removed from all audited templates**

| Removed from body | Was duplicated in |
|---|---|
| App name / SPECIAL SOFTWARES brand bar | Diary legacy template `brand-bar` |
| Legal operator row | `pdfDocumentMetaTableHtml` |
| Generated by / generated at rows | Metadata table + old footer |
| `pdf-meta-notice` grey block | Above metadata table |
| Mid-body `legal-note` / `.pdf-payment-notice` | Payment PDF under title |
| Grey `.brand` disclaimer styling (pro pack) | Now `.matter-disclaimer` in body as record text |
| `identitySection` duplicate of profile | Diary legacy template |

**Templates audited**

| Template | File | Profile header | Unified footer |
|---|---|:---:|:---:|
| Work log | `businessEntryPdfTemplate.ts` (`work_update_issue`) | Yes | Yes |
| Staff note | same (`staff_matter`) | Yes | Yes |
| Cash record | same (`business_cash_given`) | Yes | Yes |
| Payment request | same (`payment_request`) | Yes | Yes + supplementary line |
| Material dispatch | same (`material_dispatched`) | Yes | Yes |
| Material receipt | same (`material_received`) | Yes | Yes |
| Freight details | same (`outward_freight_details`) | Yes | Yes |
| Reminders (purchase/email/GST) | same | Yes | Yes |
| Legacy diary report | `diaryEntryPdfTemplate.ts` | Yes | Yes |
| Professional service packs | `professionalPackPdfTemplate.ts` | Yes | Yes |
| Letterhead PDF | `letterheadPdfService.ts` | **No** (by design) | Yes |

**i18n:** `pdf.userProfileTitle` (en/hi) for profile block title.

**Verification:** `npm run typecheck` **PASS**. Sample PDF screenshots on device **not captured** in CI — export one payment request + one freight + one letterhead PDF on simulator and confirm: single profile block at top, no metadata table above footer, grey text only in bottom footer.

### Last login vs last active (P0 — May 2026)

| Item | Detail |
|---|---|
| **Root cause** | Dashboard showed `Math.max(session.lastActiveAt, user.lastActiveAt, signedInAt)` as “Last active”. `saveSession` and `touchLastActive` wrote **now** on every app open, You tab focus, and `AppState` resume — so the line tracked **dashboard load time**, not a prior login. |
| **Fields on `UserProfile`** | `lastLoginAt` — current OTP session only. `previousLoginAt` — prior login (dashboard label). `lastActiveAt` — usage heartbeat (separate; never labelled “last login”). |
| **When updated** | `lastLoginAt` / `previousLoginAt`: **only** in `applyOtpLoginTimestamps()` inside auth backends on successful `confirmOtp` (`mock.ts`, `shared-dev.ts`, `firebase.ts` `resolveOrCreateUser`). `lastActiveAt`: OTP login + `touchLastActive()` (≥60s throttle, `AppState` active only — **not** You tab focus). |
| **UI location** | **Settings tab only** — `AccountActivityStatus` in `app/(app)/(tabs)/settings.tsx` (not on You dashboard). Login via `resolveLoginSubtitle`; “Last active” from `user.lastActiveAt` (separate label). |
| **Local persistence** | Mock registry `vyd_mock_registry_v1` stores all three fields on `users[uid]`. Session `vyd_session_v2` mirrors profile without overwriting login fields on boot. |
| **Firebase persistence** | `users/{uid}` document: `lastLoginAt`, `previousLoginAt`, `lastActiveAt` written on OTP via transaction; `updateProfile` merges `lastActiveAt` only from activity touch. |
| **Migration** | Existing profiles without login fields: `normaliseUserProfile` defaults nulls; polluted `lastActiveAt` is **not** promoted to login. After deploy, first OTP sets `lastLoginAt`; second OTP sets `previousLoginAt` for “Last login”. |
| **Files changed** | `src/domain/types.ts`, `src/services/auth/loginTimestamps.ts`, auth backends, `src/state/auth.tsx`, `src/services/session.ts`, `AccountActivityStatus.tsx`, `app/(app)/(tabs)/settings.tsx`, `UserGreetingHeader.tsx`, `en.ts` / `hi.ts` |

**Manual test results (logic review; device QA recommended):**

| Scenario | Expected |
|---|---|
| **First login** (new number) | Settings → Sign-in section shows first-login copy; “Last active” after OTP. You tab has greeting only. |
| **Second login** (logout → OTP again) | Settings → “Last login” shows **first** OTP time (`previousLoginAt`). |
| **App reload** (stay signed in) | Settings lines unchanged; `lastLoginAt` not rewritten on boot/hydration. |
| **App resume** | “Last login” unchanged; “Last active” may update after throttled `touchLastActive`. |

`npm run typecheck` **PASS** after this change.

### Business Premium UI System (May 2026)

Centralised corporate styling — **not** flashy; no list blur, no constant animation.

| Component | Role |
|---|---|
| `src/components/ui/premiumTokens.ts` | Shared gradient, gloss, border, elevation tokens |
| `src/components/ui/PremiumActionButton.tsx` | Variants: `primary` (gradient+gloss), `secondary` (calm fill), `glass` (frosted static fill), `success` (restrained green gradient), `danger` (flat sober), `ghost` (minimal). Sizes `md`/`lg`, shapes `rounded`/`pill`, press `scale: 0.98`, loading/disabled |
| `src/components/ui/Button.tsx` | Thin wrapper → `PremiumActionButton` (all existing `Button` imports get premium primary automatically) |
| `src/components/you/PremiumNewRecordButton.tsx` | You footer: `PremiumActionButton` `primary` + `pill` (footprint unchanged) |
| `src/components/ui/PremiumCard.tsx` | Static elevated surface (no blur) — success panels |
| `src/components/ui/PremiumSuccessPrompt.tsx` | Post-save title + banners + action stack |
| `src/components/ui/GlassSurface.tsx` | Unchanged — liquid glass for settings chrome / tab bar (not inside lists) |

**Dependency:** `expo-linear-gradient` (already installed, SDK 54).

**Gradient / shadow / theme:** Primary uses indigo 3-stop diagonal gradient + static gloss overlay; dark/light stops in `premiumTokens.ts`. iOS `shadowOpacity` ~0.18–0.32; Android `elevation: 3`. Glass variant uses `glassFallbackMuted(resolvedMode)` — **no** `BlurView` on buttons (scroll-safe).

**Screens / files touched explicitly:**

| Area | Change |
|---|---|
| All screens using `Button` | Primary/save/continue CTAs → premium gradient via wrapper |
| `ComposerSaveSuccess.tsx` | `PremiumSuccessPrompt` + hierarchy: View Record/PDF `primary`, Share `glass`, Add Another/Edit `secondary`, Dashboard `ghost` |
| `app/(app)/settings/identity.tsx` | Footer `primary` or `glass` (no dirty); Upload `secondary`; Remove logo `ghost` |
| `app/(app)/diary/[id].tsx` | Export PDF `primary`; Share `glass`; Delete stays `danger` |
| `ComposerPickerSheet.tsx` | Subtle hairline border on option rows (no row gradients) |
| Letterhead / auth / forms | Inherit `Button` premium primary where label is default variant |

**Intentionally unchanged (sober / minimal):** Delete, Logout, Remove logo (ghost on identity), Cancel, Not now, Back, Terms/Privacy links, filter chips, `EmptyState`/`ErrorState` secondary retries, disabled states.

**+ New Record:** Placement, width, height (`paddingVertical: 14`, pill), and composer action unchanged.

**Manual test results:** Not run on device in CI; verify iOS glass settings cards + Android fallback, dark mode contrast, You footer size, composer success hierarchy. No scroll jank expected (no blur in lists).

`npm run typecheck` **PASS**.

### Profile / Business identity (May 2026)

Opened from **You** avatar (`from=you`) or **Settings → Profile / Business identity**.

| Item | Detail |
|---|---|
| **Files** | `app/(app)/settings/identity.tsx`, `src/components/profile/IdentityPreviewCard.tsx`, `src/utils/profile/identityDraft.ts`, `src/services/auth/normalizeProfile.ts` (`applyProfilePatch` skips `updatedAt` when unchanged), `app/(app)/(tabs)/you.tsx` (`from` param), `src/i18n/locales/en.ts` / `hi.ts` |
| **Hero copy** | `identity.heroTitle`, `heroBody`, `heroFoot` — corporate explanation; no legal overclaims |
| **Preview card** | `IdentityPreviewCard` — logo/initials, display name, business name, UEID; updates live from form + logo draft |
| **Fields** | Logo upload/remove (deferred until save), display name (required), business/shop name, work type (optional), PDF logo toggle |
| **Helper text** | `identity.logoHint`, `identity.businessNameHint` |
| **Dirty detection** | `isIdentityDirty()` compares form + toggle + logo draft vs `snapshotIdentityBaseline()` |
| **Primary button** | No changes → `identity.goToDashboard` → `replace('/(app)/(tabs)/you')`. Dirty → `identity.saveChanges` → validate + save |
| **No-change save** | Early return if not dirty; no success alert; `applyProfilePatch` does not bump `updatedAt` |
| **Save flow** | Build minimal `ProfilePatch`; persist/remove logo file on save; single `updateProfile`; success `Alert` with Stay here / Go to dashboard; `saving` blocks double-tap |
| **Validation** | Empty display name → inline `identity.displayNameRequired`, scroll top + focus |
| **Logo edge cases** | Picker cancel → no draft change. Remove only if saved logo or picked preview exists. Remove sets draft `removed`; file deleted on save only |
| **Theme / i18n** | `useThemedStyles` throughout; en + hi keys under `identity.*` |

**Manual test results (logic review):**

| Scenario | Expected |
|---|---|
| Open from You, no edits | Footer **Go to your dashboard** → You tab |
| Edit name / toggle / pick logo | Footer **Save changes**; back warns if dirty |
| Save with valid data | Alert **Business identity updated**; baseline reset; no save if nothing changed |
| Cancel image picker | Unchanged dirty state |
| Remove logo when none | Button hidden |

`npm run typecheck` **PASS**.

### Live greeting + profile / PDF branding (May 2026)

| Area | Implementation |
|---|---|
| **You header** | `UserGreetingHeader` — time-aware greeting + avatar only (no login/activity lines) |
| **Settings activity** | `AccountActivityStatus` — “Last login” / first sign-in copy + “Last active” (`settings.*` i18n) |
| **Activity heartbeat** | `user.lastActiveAt` + `AuthSession.lastActiveAt` — OTP + throttled `touchLastActive` on `AppState` active |
| **User model** | `profileLogo`, `pdfBranding`, `lastLoginAt`, `previousLoginAt`, `lastActiveAt` |
| **Logo storage** | `src/services/profileLogo/storage.ts` — copy to `documentDirectory/profile-logos/{uid}.jpg`; metadata on profile; Firebase-ready shape |
| **Business identity screen** | See [Profile / Business identity (May 2026)](#profile--business-identity-may-2026) below |
| **PDF branding** | `getUserPdfBranding()` + `pdfUserProfileHeaderHtml()` in `pdfLayout.ts` / `userPdfBranding.ts`; used by business entry, pro pack, legacy diary PDFs; **letterhead skips profile header** (`context: 'letterhead'`, footer only) |
| **i18n** | `you.greetingMorning/Afternoon/Evening`, `you.lastLogin`, `you.firstLogin`, `you.lastActive` (legacy key), `identity.*` (en + hi) |

**Manual checks:** `npm run typecheck` pass; upload logo → appears on You + PDF when toggle ON; letterhead PDF unchanged; toggle OFF → PDFs without logo block; remove logo → initials fallback.

### You dashboard (command centre — May 2026 scalability pass)

**Role:** Short **business command centre** on `app/(app)/(tabs)/you.tsx` — not a full ledger. Full browse → **All records** (`/(app)/diary`), **Global Search**, **At a Glance** drill-downs, **Calendar & Maps**.

**Layout order (top → bottom):** Greeting → Global Search → sync/backend banners → **At a Glance** stat tiles → *(sections below render only when matching data exists — see zero-state rules)* → footer `+ New record`. Section **See all** links go to Diary / At a Glance (no extra quick-link chips).

#### You dashboard zero-state visibility (Jun 2026)

**Goal:** Fresh users see an intentionally minimal command centre — no empty placeholder sections, no motivational clutter. Sections appear only when the user has created meaningful data.

**Files changed:**

| File | Change |
|---|---|
| `src/services/dashboard/youDashboardSummary.ts` | `YouDashboardVisibility`, `YouDashboardViewModel`, `buildYouDashboardViewModel()`, `deriveYouDashboardVisibility()` |
| `src/services/dashboard/index.ts` | Export view-model types + builder |
| `app/(app)/(tabs)/you.tsx` | Conditional section rendering from `dashboard.visibility`; draft count fetch; removed `EmptyState` / `ExecutiveInlineEmpty` empty blocks |

**Central view-model fields (`dashboard.visibility`):**

| Field | Meaning |
|---|---|
| `hasRecords` | ≥1 diary/business entry |
| `hasDrafts` | ≥1 active form draft |
| `hasSavedPdfs` | ≥1 generated/saved PDF (entry, letterhead, or pro pack) |
| `hasUpcomingItems` | ≥1 future reminder (At a Glance upcoming count) |
| `hasNeedsAttention` | ≥1 due follow-up / attention item |
| `hasLetterheadDocs` | ≥1 letterhead doc with saved PDF or saved flag |
| `hasAnyDashboardActivity` | OR of records, drafts, PDFs, attention, letterhead docs |
| `showRecentActivity` | `hasRecords` |
| `showSavedDrafts` | `hasDrafts` |
| `showSavedPdfs` | `hasSavedPdfs` |
| `showNeedsAttention` | `hasNeedsAttention` |

**Zero-state (no user-created activity):** Only **hero card** (tappable identity), **Global Search**, and **At a Glance** (compact stat tiles with zero counts). Sync/offline/error banners remain operational in the top cluster. `+ New record` footer unchanged.

**Hidden until data exists:**

| Section | Shown when |
|---|---|
| Saved Drafts | `showSavedDrafts` (also self-hides in `YouSavedDraftsSection` when count = 0) |
| Needs attention | `showNeedsAttention` — no header or inline empty when zero |
| Recent activity | `showRecentActivity` — no loading skeleton, empty card, or “create first record” prompt |
| Saved PDFs / documents | `showSavedPdfs` — no inline empty when zero |

**At a Glance:** Always visible; zero counts stay inside the three stat tiles (no separate empty dashboard sections).

**Manual test matrix (Jun 2026 pass — code + typecheck; device QA recommended):**

| Scenario | Expected |
|---|---|
| Fresh user (no records/drafts/PDFs) | Hero + search + At a Glance only |
| Create one record | Recent activity section appears |
| Save one draft | Saved Drafts section appears |
| Generate one PDF | Saved PDFs section appears |
| Add follow-up reminder | Needs attention section appears |
| Delete all records/drafts/PDFs | Dashboard returns to minimal zero-state |
| Section headers | Never rendered without matching items |
| Light / dark / system | Unchanged theme tokens; `npm run typecheck` pass |

#### Pull-to-refresh (Jun 2026)

**Purpose:** Reload local data + recalculate view models; when online and session valid, flush sync queue and pull cloud entries. Not used on composer/forms (draft autosave only).

**Shared mechanism:**

| Piece | Role |
|---|---|
| `useSync().runRefreshSync()` | `src/state/sync.tsx` — flush queue + `pullEntriesToLocalCache` when online; skips sync when offline or `sessionSyncGate` locked; always refreshes pending count |
| `useAppRefresh` | `src/hooks/useAppRefresh.tsx` — debounced pull handler (2s min interval), `RefreshControl`, `refreshNote` copy |
| `LastRefreshedHint` | `src/components/ui/LastRefreshedHint.tsx` — subtle “Updated just now” / offline / session lines |
| `Screen` | Optional `refreshing` + `onRefresh` on scroll screens |

**i18n:** `refresh.updatedJustNow`, `refresh.offlineSaved`, `refresh.sessionExpiredLocal`; `sync.sessionExpiredBanner` updated for re-auth CTA.

**Screens integrated:**

| Screen | Local reload | Sync |
|---|---|---|
| You dashboard | Diary list + letterhead scan + pro packs + draft count | Yes |
| Statutory tab | `buildStatutoryTabViewModel` | Yes |
| Calendar & Maps | `useCalendarMapsData` refresh | Yes |
| All Records (`diary/index`) | `useDiaryList` refresh | Yes |
| Drafts | `formDraftsRepository.listActiveUserDrafts` | Yes |
| Letterhead history | Letterhead docs + config | Yes |
| Global Search | — | Skipped (index rebuild on focus; pull would disrupt typing) |

**Not integrated:** Composer forms, letterhead creation, professional pack form, payment/cash/freight/staff forms, record detail edit screens.

**Offline:** Local reload always runs; `refresh.offlineSaved` — “Offline — showing saved records.” No error modal.

**Session expired:** Local reload runs; sync blocked; `refresh.sessionExpiredLocal` + existing `SyncStatusBanner` (“Session expired. Tap to re-authenticate. Your local data is safe.”) — no logout, no data loss.

**UX:** No full-page reload when data already visible; initial load still uses `Loader` only when list empty; native `RefreshControl` spinner.

**Manual test matrix (code + typecheck):**

| Scenario | Expected |
|---|---|
| Pull on You (online) | Dashboard data reloads; sync runs; “Updated just now” |
| Pull offline | Local data refreshes; offline copy |
| Pull with session lock | Local refresh; session copy; banner unchanged |
| Rapid double-pull | Debounced — no duplicate sync storm |
| Composer form | No pull-to-refresh |
| `npm run typecheck` | Pass |

**Preview caps (never grow on You):**

| Section | Cap | View all |
|---|---|---|
| Needs attention | 5 | `/(app)/diary?filter=upcoming` or At a Glance upcoming |
| Recent activity | 3 | `/(app)/diary` |
| Saved PDFs | 3 | `/(app)/diary` (+ optional Letterhead history link when more exist) |

**Data:** `src/services/dashboard/youDashboardSummary.ts` — single-pass summary from diary fetch (`YOU_DASHBOARD_ENTRY_LIMIT` = 80), letterhead scan capped to 30 PDF-bearing docs (client slice after list), pro packs limit 25, active draft count for visibility. **`buildYouDashboardViewModel()`** is the single entry point for You tab rendering decisions. No schema/PDF/search/calendar changes.

**Calendar & Maps responsiveness:** Map markers build only when **Map** sub-mode is active (`useCalendarMapsData({ mapActive })`). GPS pins render immediately; PIN markers load in a second phase after the offline pincode DB warms (deferred on tab mount). Opening the Calendar tab alone does not await the pincode DB.

**Diary history:** `/(app)/diary` — initial `limit` 80, **Load more** + `onEndReached` (+50 per step); no unbounded Firestore load.

**At a Glance detail:** `AT_A_GLANCE_SECTION_PREVIEW_CAP` = 5 per section; `totalCount` on section; footer **View all (N)** → diary (upcoming filter on upcoming view).

**Deferred:** Category hub routes, server pagination cursors, dedicated Documents library screen.

- **Smart headlines:** `src/components/ui/SmartHeadline.tsx` — At a glance, Needs attention, Recent activity, Saved PDFs.
- **Single + action:** `+ New record` footer bar (`you.addEntryBar`) opens one executive bottom sheet (`you.pickerTitle` / `you.pickerSubtitle`). Visual: `PremiumNewRecordButton` — see [You + New Record button (May 2026)](#you--new-record-button-may-2026).
- **Composer picker UI:** `app/(app)/(tabs)/you.tsx` — each row = compact **label** + one-line **subtitle** (no numbered list); keys under `composer.options.*`.
- Letterheads stat tile removed; letterheads appear under Saved PDFs only.

#### Composer display labels (May 2026 refresh)

Underlying entry types, forms, and Zod validation are unchanged. Only user-facing copy and picker layout changed.

| i18n key | Old label (EN) | New label (EN) | Subtitle key | New subtitle (EN) |
|---|---|---|---|---|
| `composer.options.professionalPack` | Prepare Professional Service Pack | Professional brief | `professionalPackSub` | For CA, CS, or counsel |
| `composer.options.letterheadMatter` | Prepare a Letterhead Matter | Letterhead | `letterheadMatterSub` | A4 letter on your letterhead |
| `composer.options.workAndTeam` | Work & team (umbrella) | Work & team | `workAndTeamSub` | Drill-down → Work & issues or Staff |
| `composer.options.workUpdate` | *(sub-picker only)* | Work & issues | `workUpdateSub` | Site work or operational issues |
| `composer.options.staffMatter` | *(sub-picker only)* | Staff | `staffMatterSub` | Instructions, leave, notes |
| `composer.options.cashGiven` | Cash Given for Business Purpose | Cash paid | `cashGivenSub` | Business cash outflow |
| `composer.options.materialDispatched` | Material Dispatched / Consignment | Dispatch | `materialDispatchedSub` | Outgoing material record |
| `composer.options.materialReceived` | Material Received / Raw Material | Receipt | `materialReceivedSub` | Incoming stock or raw material |
| ~~`composer.options.reminderGst`~~ | — | Removed — use Statutory Information tab |
| `you.pickerTitle` | Business entry | New record | — | — |
| `you.pickerSubtitle` | Choose what you need to record… | Select a record type. | — | — |
| `you.addEntryBar` | + New business entry | + New record | — | — |

**Removed from picker i18n (options no longer in `COMPOSER_OPTIONS`):** `reminderPurchase`, `reminderEmail` (keys dropped from `composer.options` in en/hi).

**`composer.types.*`** shortened for history filters, Saved PDFs meta, and map pins (aligned with option labels).

**Form screen headers** (`app/(app)/composer/[type].tsx`) now use `composer.options.{labelKey}` via `composerOptionForType()` — not the longer legacy phrasing.

**Hindi:** matching compact labels in `src/i18n/locales/hi.ts` (`composer.options.*`, `you.*`, `composer.types.*`).

**Manual verification (2026-05-31):** `npm run typecheck` pass; picker renders 8 rows (pro brief + 7 composer options) with label/subtitle; no purchase/email rows. Device screenshot pass recommended on iOS/Android for sheet spacing.

### Calendar

- `app/(app)/(tabs)/calendar.tsx` — blue dot = entry date; amber dot = follow-up due date (`reminder.at` from business entry composer).
- Day panel lists entries on selected date and a separate numbered follow-ups section with summary metadata.
- **Professional packs:** purple calendar dot on `dueDate` or `reminder.at`; pack follow-ups appear in the day panel alongside diary follow-ups.

---

## Professional Service Pack (May 2026)

Neutral documentation utility for structured briefs the user shares with their **own** CA, CS, or lawyer. **Not** tax/legal/compliance advice, filing, marketplace, or in-app professional engagement.

### Entry point

`+ New business entry` → **1. Prepare Professional Service Pack** → category → matter type → form → save + A4 PDF.

### Data model — `ProfessionalServicePack`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Firestore doc id / mock uuid |
| `userId` | string | Owner |
| `ueid` | UEID | From profile |
| `professionalCategory` | `ca_tax` \| `cs_compliance` \| `legal` | |
| `matterType` | string (18 ids) | See below |
| `title` | string | Auto-generated if blank |
| `facts` | `Record<string, string \| number \| null>` | Matter-specific required fields + `matterSummary` |
| `linkedEntryIds` | string[] | Optional diary links |
| `attachments` | `AttachmentRef[]` | Modeled; UI upload not wired |
| `matterDate` | number (ms) | Primary matter date |
| `dueDate` | number \| null | Calendar + reminders |
| `reminder` | `EntryReminder` \| null | Local notification |
| `status` | `active` \| `shared` \| `completed` | |
| `professionalName` / `professionalContact` | string \| null | Optional |
| `notes` | string \| null | |
| `pdfUri` | string \| null | Generated on save |
| `createdAt` / `updatedAt` / `deletedAt` | number | Soft delete |

Repository: `src/services/professionalPack/` (mock AsyncStorage + Firebase `users/{uid}/professionalPacks`).

### Matter types (18)

| Category | Matter type ids |
|---|---|
| **CA / Tax** | `gst_return_support`, `gst_notice_query`, `itr_tax_filing_pack`, `tds_tcs_matter`, `bookkeeping_support`, `expense_cash_review` |
| **CS / Compliance** | `llp_company_compliance`, `roc_filing_reminder`, `board_resolution_brief`, `annual_filing_checklist`, `din_dsc_kyc_reminder`, `entity_change_compliance` |
| **Legal** | `payment_recovery`, `legal_notice_prep`, `agreement_drafting`, `lease_property_review`, `staff_labour_issue`, `business_dispute_record`, `trademark_ip_query`, `court_case_diary` |

Defs: `src/domain/professionalPackMatters.ts`. i18n: `proPack.*` in `en.ts` / `hi.ts`.

### Validations

- `src/utils/professionalPack/validation.ts` — Zod per matter; all required fields non-blank; optional fields skip empty checks.
- **GSTIN** / **email** / **amount** / **date** validated only when user enters a value.
- No save without valid required facts; `saveWithPdf` double-save guard (`saveInFlight`).
- Drafts: `src/services/professionalPack/drafts.ts` (per user/category/matter); cleared on successful save.

### Disclaimer text

**Screen** (`proPack.formDisclaimer`):

> This brief is based solely on information you enter. It is for sharing with an independent CA, CS, or lawyer and must be verified by them before use. The app does not verify facts, file returns, or create a professional-client relationship.

**PDF body** (`proPack.pdf.disclaimer`):

> User-generated brief for sharing with an independent professional only. Not tax, legal, or compliance advice. Verify all facts before use.

Plus standard `legal.pdfFooter` on every pack PDF via `pdfLegalFooterHtml`.

### PDF templates

| File | Title examples |
|---|---|
| `src/services/pdf/professionalPackPdfTemplate.ts` | Per-matter titles via `proPack.pdfTitles.*` (e.g. “GST Matter Brief for CA/Tax Professional”, “Payment Recovery Brief for Legal Professional”) |

### Integration

| Surface | Behaviour |
|---|---|
| **History** | `app/(app)/professional-pack/history.tsx` — search, list, open detail |
| **Diary history** | Banner + link to professional packs (not mixed into entry list) |
| **You → Saved PDFs** | Packs with `pdfUri` listed with composer/letterhead PDFs |
| **You → Upcoming** | Pack `reminder.at` or future `dueDate` |
| **Calendar** | Purple dot + day list entries for pack due/reminder |
| **Detail** | Regenerate/share PDF, mark shared/completed, edit, soft-delete (cancels reminder) |

### Files changed / added (feature)

- `src/domain/professionalPack.ts`, `professionalPackMatters.ts`
- `src/services/professionalPack/*`, `saveWithPdf.ts`, `drafts.ts`
- `src/services/pdf/professionalPackPdfTemplate.ts`
- `src/utils/professionalPack/validation.ts`, `display.ts`
- `src/components/professionalPack/ProfessionalPackForm.tsx`
- `app/(app)/professional-pack/_layout.tsx`, `index.tsx`, `matters.tsx`, `form.tsx`, `history.tsx`, `[id].tsx`
- `app/(app)/(tabs)/you.tsx`, `calendar.tsx`, `diary/index.tsx`
- `src/i18n/locales/en.ts`, `hi.ts`

### Manual test results (code review / typecheck)

| Pack | Category | Matter | Verified in code |
|---|---|---|---|
| CA | `ca_tax` | `gst_return_support` | Form fields, validation, PDF title `pdfGstReturn`, save + history route |
| CS | `cs_compliance` | `roc_filing_reminder` | Form + `pdfRoc`, calendar due/reminder hooks |
| Legal | `legal` | `payment_recovery` | Form + `pdfPaymentRecovery`, status/share/delete on detail |

`npm run typecheck` — **pass** (2026-05-31). Device smoke test on simulator recommended before release.

### Remaining limitations

- File **attachments** not wired in form UI (model + storage ready).
- **Firestore rules** for `professionalPacks` added in `firestore.rules` — deploy rules before production Firebase use.
- Pack facts in PDF use raw field keys as row labels (i18n labels on screen only).
- No global search across diary + packs in one query (separate history screens).
- Edit flow reloads form; changing matter type on edit not supported.
- No Vyaamikk Samadhaan roles, marketplace, chat, payments, KYC, or filing services (by design).

---

## Appendix A — Environment variables

All variables must be prefixed `EXPO_PUBLIC_` so Expo inlines them. They
are bundled into the client; do **not** put server-side secrets here.

| Variable | Required when | Example |
|---|---|---|
| `EXPO_PUBLIC_APP_MODE` | always | `development` or `production` |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | `production` | `AIza…` |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `production` | `vyaamikk-diary.firebaseapp.com` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `production` | `vyaamikk-diary` |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `production` | `vyaamikk-diary.appspot.com` |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `production` | `123456789012` |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | `production` | `1:123…:web:abc…` |
| `EXPO_PUBLIC_BRAND_OWNER` | optional | `SPECIAL SOFTWARES` |
| `EXPO_PUBLIC_LEGAL_OPERATOR` | optional | `Ananya Engineered Industrial Components & Pay Systems LLP` |
| `EXPO_PUBLIC_APP_NAME` | optional | `Vyaamikk Diary` |
| `EXPO_PUBLIC_PRIVACY_URL` | optional | `https://…` |
| `EXPO_PUBLIC_TERMS_URL` | optional | `https://…` |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | optional | `support@…` |

## Appendix B — Key files to read in order

If you're skimming the code for the first time, read in this order:

1. `app/_layout.tsx` — root providers + Stack
2. `app/index.tsx` — boot/routing decision
3. `src/state/auth.tsx` — auth state machine
4. `src/services/auth/types.ts` + `mock.ts` — the contract + reference impl
5. `src/utils/ueid.ts` — UEID format and generator
6. `src/services/auth/firebase.ts` — Firestore resolve transaction
7. `src/services/diary/types.ts` + `mock.ts` — repository contract + ref impl
8. `src/components/diary/EntryForm.tsx` — the most complex screen-level component
9. `app/(app)/(tabs)/you.tsx` — You dashboard composition
10. `firestore.rules` — security model

---

## End-of-day stabilization pass (2026-05-31)

### Commands run

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** (`tsc --noEmit`, exit 0) |
| `npm run lint` | **PASS** (alias → `typecheck`) |
| `npm test` | **Not configured** — no test script in `package.json` |
| `npm run android` / `ios` | **Not run** in this pass (requires device/simulator) |

### Bugs found (audit)

| Area | Issue |
|------|--------|
| Backend honesty | `getActiveBackend()` logged to Metro but **no in-app banner** for local-mock / shared-dev / not-configured |
| Composer reminders | `ReminderFields` opened date picker **without** notification permission rationale (silent reminder failure) |
| Composer save | `saveWithReminder` **swallowed** notification errors — looked like success |
| Composer PDF | PDF failure **silent** after entry saved |
| Share UX | Share/PDF cancel could surface as **danger banner** on entry detail |
| Greeting | Time-of-day greeting **frozen** at first mount (`useMemo([])`) |
| Layout | `+ New record` footer **hidden under glass tab bar** (fixed earlier: `tabBar.height` padding) |
| Docs | HANDOVER still referenced removed `dashboard.tsx` route |

### Files changed (this pass)

- `src/components/ui/BackendModeBanner.tsx` (new)
- `src/components/ui/index.ts`
- `src/components/composer/ReminderFields.tsx`
- `src/services/diary/saveWithReminder.ts`
- `src/services/diary/saveComposerEntry.ts`
- `app/(app)/composer/[type].tsx`
- `src/components/ui/Screen.tsx` (`keyboardAvoiding`)
- `src/components/profile/UserGreetingHeader.tsx`
- `app/(app)/(tabs)/you.tsx`, `settings.tsx`
- `app/(auth)/login.tsx`
- `app/(app)/diary/[id].tsx`
- `src/utils/shareDismissed.ts` (new)
- `src/i18n/locales/en.ts`, `hi.ts`
- `package.json` (`lint` script)
- `HANDOVER.md` (this section)

### Bugs fixed

- In-app **backend mode banner** on Login, You, Settings
- Composer **reminder permission** flow (rationale → native prompt → picker)
- **Reminder save errors** propagate when OS permission missing
- **PDF partial failure** alert after save (`entrySavedPdfFailed`)
- **Share cancel** no longer shows error on entry detail
- **Greeting period** refreshes on tab focus
- **Keyboard avoiding** on composer scroll screen
- **`lint` script** added (typecheck alias)

### Bugs remaining / manual verification needed

| Item | Risk | Test first tomorrow |
|------|------|---------------------|
| Full auth OTP on device | High | Login → OTP → UEID → complete profile → You |
| Firebase production build | High | Real SMS + Firestore rules |
| Hindi PDF glyph rendering | Medium | Export entry with Hindi notes |
| Letterhead writable area edge cases | Medium | Setup → create → history reopen |
| Professional pack flow | Medium | Picker → matter → PDF |
| Glass tab bar on small iPhones SE | Low | Footer + last list row clearance |
| `npm test` / E2E | N/A | Add Detox or Maestro if release-bound |

### Manual test matrix (code-reviewed; device not run in CI)

| Flow | Code status |
|------|-------------|
| Login → profile gate | Boot `index.tsx` + `(app)/_layout.tsx` guard `profileCompletedAt` |
| You dashboard | Greeting, last active, backend banner, tab bar inset + footer |
| + composer | Validation schemas, double-save guard, discard dialog, reminder permission |
| Save / PDF / reminder | Repositories + `saveComposerEntry` / `saveWithReminder` |
| Calendar / detail / edit / delete | `tabBarInset`; mock/firebase cancel reminder on delete |
| Settings theme/lang | `ThemeContext` + AsyncStorage; `LanguageToggle` |
| Letterhead gate | `letterhead/index.tsx` routes to setup when no config |
| Logout / relogin | `auth.tsx` `signOut` → login |

### Current backend mode

Determined at runtime by `getActiveBackend()` in `src/config/env.ts`:

- **Development + no `.env` Firebase** → `local-mock` (banner shown)
- **Development + Firebase configured** → `firebase-shared-dev` (banner shown)
- **Production + Firebase** → `firebase-production` (no banner)
- **Production + missing Firebase** → `not-configured` (banner on login)

Check Metro once on boot: `[state/auth] active backend` log line.

### Release readiness

**Internal / TestFlight beta** — ready after **one full device pass** of the manual matrix above.

**Production** — not ready until: legal URLs verified, Firebase production OTP, counsel review of PDF footer (`LEGAL_REVIEW_TODO`), and automated smoke tests.

### Next recommended task

Run the manual matrix on a physical iPhone (home indicator) and one Android device; file any layout-only issues. Then add `npm test` or Maestro smoke for login + one composer save.

---

## Payment Request & Outward Freight Details (2026-05-31)

### Data model (`src/domain/businessEntry.ts`)

| Type | Payload | Calendar / search |
|------|---------|-------------------|
| `payment_request` | `PaymentRequestPayload` — party, invoice no/date/amounts, due or pending-since, request date, status (`draft`…`disputed`), optional contact/bank/note, optional `linkedEntryId` | `entryDate` = payment request date; search indexes party, invoice, contact, bank text |
| `outward_freight_details` | `OutwardFreightPayload` — dispatch title, bill/LR, locations, boxes, weight, freight type, CC instruction, clarification contact, optional `linkedDispatchId` + `linkedDispatchUpdatedAt` | `entryDate` = bill date; search indexes bill, LR, destination, transporter, vehicle, contact, party |

Not a payment gateway, loan, legal notice, recovery service, or transporter marketplace.

### Composer (+ New record)

- **Payment request** — “Pending invoice dues”
- **Freight details** — “Transporter dispatch info”
- Forms: `PaymentRequestFields.tsx`, `OutwardFreightFields.tsx`, `ComposerDateField.tsx`
- Validation: `paymentRequestSchema`, `outwardFreightSchema` in `validation.ts`
- Pending amount > invoice → confirm dialog before save
- Dispatch record expanded fields (invoice, destination, LR, transporter) for better freight prefill

### Dispatch → Freight

- Detail on `material_dispatched`: **Create freight details from dispatch**
- Route: `/(app)/composer/outward_freight_details?linkedDispatchId=<dispatchId>`
- Prefill: `freightDefaultsFromDispatch()` in `src/utils/businessEntry/freightFromDispatch.ts`
- Linked freight shows warning if dispatch `updatedAt` > `linkedDispatchUpdatedAt`; **Refresh from dispatch** on detail (user-confirmed, does not auto-mutate)

### PDF & share

- PDF titles: **Payment Request Against Pending Invoice** / **Outward Freight Information / Dispatch Update**
- Payment PDF includes user-generated disclaimer (not legal notice / loan / recovery guarantee)
- Share message: `formatFreightShareMessage()` — omits blank optional lines
- Reuses `getUserPdfBranding()`, legal footer, `saveComposerEntry()` pipeline

### Edit / history

- Composer edit: `/(app)/composer/[type]?entryId=<id>` (updates via repository; PDF regen on create path only — re-export from detail after edit)
- Diary history search, calendar dots, detail view, delete, PDF export, share — same as other business entries

### Commands

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |

### Manual test — sample freight share (device)

Enter on freight form:

| Field | Value |
|-------|--------|
| Dispatch title | Supreme Laminations |
| Bill no. | SLFY2526/0014 |
| Bill date | 29 Jul 2025 |
| LR no. | 159246113 |
| Delivery location | KOTA Godown |
| Total boxes | 100 |
| Total weight | 1119.65 |
| Freight type | To Pay |
| CC copy | Not to be attached |
| Clarification | so and so + valid mobile |

Expected share text shape:

```
🚚 Dispatch Update – Supreme Laminations

📄 Bill No.: SLFY2526/0014
🗓️ Bill Date: 29/07/2025
📑 LR No.: 159246113
📍 Delivery Location: KOTA Godown
📦 Total Boxes: 100
⚖️ Total Weight: 1119.65 Kg
💳 Freight Type: To Pay
❌ CC Copy: Not to be attached

For any clarification, please connect with:
so and so — <mobile>
```

*(Date format follows device locale via `formatEntryDate`.)*

**Status:** Code-complete; device pass not run in CI session.

---

## Payment Request & Freight — refinement pass (2026-05-31)

### Required vs optional fields (changed)

**Payment request — required only**

| Field | Notes |
|-------|--------|
| Party / customer name | |
| Invoice / bill number | |
| Pending amount | Must be &gt; 0 |
| Request note | Optional in form; **auto-generated** in `buildAutoPaymentRequestNote()` if blank at save |

**Payment request — now optional (were required or conditionally required)**

| Field | Was |
|-------|-----|
| Invoice date | Required |
| Invoice amount | Required |
| Due date **or** pending-since | At least one required (`superRefine`) |
| Payment request date | Required (defaults to `entryDate` at save if unset) |
| Contact person, bank/payment details | Already optional |
| Status | Required in form → optional (default `draft`) |
| Reminder, remarks (`notes`), linked entry ID | Optional |

**Freight details — required only**

| Field | Notes |
|-------|--------|
| Bill / challan number | |
| Delivery location | |
| Total boxes | Message: “Total boxes must be greater than 0” |
| Total weight | Must be &gt; 0 |
| Freight type | |
| CC copy instruction | |
| Clarification contact name + mobile | |

**Freight details — now optional**

| Field | Was |
|-------|-----|
| Dispatch title | Required → optional; share/PDF use bill no. if blank |
| Bill date | Required → optional; omitted from share when unset |
| LR / GR, transporter, vehicle, dispatch-from, remarks, attachments (`notes`) | Optional |

Blank optional values are stored as `null` / omitted in PDF rows (`row()` skips empty) and freight share lines.

### Post-save UX (composer)

After **Save** succeeds, the user **stays on the composer route** and sees **`ComposerSaveSuccess`** (“Saved successfully”) with:

- View record → `/(app)/diary/[id]`
- Share (freight uses `formatFreightShareMessage`; others `shareEntry`)
- Export PDF (uses saved `pdfUri` when present)
- Add another (resets form; re-prefills dispatch link if applicable)
- Go to dashboard → `/(app)/(tabs)/you`

No automatic redirect to **You** on success. Edit-save shows the same panel with “Changes saved” toast via `AppFeedbackProvider`.

`saveComposerEntry` still surfaces PDF failure via warning banner + inline banner on success panel (not fake success).

### Central feedback system

- `src/feedback/AppFeedback.tsx` — `AppFeedbackProvider` at root (`app/_layout.tsx`)
- `useAppFeedback()` — `showSuccess` / `showWarning` / `showError` / `showGuidance` (transient top banner; guidance uses muted card)
- Composer uses it on save failure, PDF warning, and edit success

### Validation UX

- `firstComposerFieldError()` + field anchor refs → scroll to first invalid field
- Inline errors on `TextField` / `ComposerDateField` (e.g. “Pending amount is required”, “Total boxes must be greater than 0”)
- Save button disabled while `saving` (no double-save); form data preserved on validation failure

### PDF body disclaimer / grey text (superseded by unified layout pass)

- All platform/legal text consolidated into **`pdfFooterHtml()`** only
- Payment clarification is a **footer supplementary line**, not body watermark text
- See **PDF layout (all export templates — May 2026 unified pass)** above for full audit table

### Commands (this pass)

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |

### Manual test matrix (device — recommended)

**Payment request (minimal save)**

1. Open **+ New record → Payment request**
2. Fill only: party, invoice no., pending amount → Save
3. Expect: success panel (not You tab); request note auto-filled on detail/PDF
4. Leave invoice date/amount empty → save still succeeds; PDF/share omit those rows

**Payment request (validation)**

1. Save with pending amount empty → inline error, scroll to field, no navigation

**Freight details (minimal save)**

1. Fill bill no., delivery, boxes, weight, freight type, CC, clarification name/mobile → Save
2. Success panel; share text without LR/transporter if left blank

**Freight (validation)**

1. Total boxes = 0 or empty → “Total boxes must be greater than 0”, stay on form

**PDF**

1. Export payment or freight PDF → no grey disclaimer paragraph under the title; grey text only in bottom footer area

**Status:** Typecheck pass in CI; **device manual pass not executed** in this session.

---

## Immutable document history + Payment Request v2 + one-page PDF (2026-05-31)

### Data model (`documentHistory` on every `BusinessEntry`)

| Field | Meaning | User-editable |
|-------|---------|---------------|
| `firstGeneratedAt` | Timestamp of **first PDF generation** for this record | No |
| `lastGeneratedAt` | Latest PDF generation time | No |
| `lastEditedAt` | Latest content edit time | No |
| `versionNumber` | Starts at `1`; increments on each audited edit | No |
| `editHistory[]` | `{ editedAt, versionNumber, fieldNames[], previousSummary, newSummary }` | No |
| `pdfGenerationHistory[]` | `{ generatedAt, versionNumber }` per PDF run | No |

- Initialized on create via `createInitialDocumentHistory()` (`mock` / `firebase` create).
- **Edits:** `mergeBusinessEntryUpdate` → `applyBusinessEntryEditAudit` → `buildBusinessEntryEditDiff` compares title, dates, notes, and payload keys; stores human-readable `previousSummary` / `newSummary` (payment lines mask account numbers in summaries).
- **PDF runs:** `mergeEntryPdfGeneration` when `pdfUri` is set on update (first save, regenerate, or re-export).
- Legacy payment payloads are **coerced** in `normalize.ts` (`coercePaymentPayload`) — old `status`, `invoiceAmount`, `paymentModeDetails` are dropped from the stored shape.

### PDF body layout (all business-entry exports)

1. **Title** (payment: *Payment Request Against Pending Invoice*)
2. **Vyaamikk User Profile** — compact block only (`pdfUserProfileHeaderHtml`)
3. **Document history** — only if `editHistory.length > 0`: first generated, last edited, version, concise changed-field line (`pdfDocumentHistoryHtml`)
4. **Record facts** — compact `meta-compact` tables; payment omits entry-date/title meta row; optional bank section only when `includeBankDetailsInPdf`
5. **Footer only** — app name, legal operator, generated-at, UEID, page label; payment adds supplementary footer line (not a body watermark)

**Removed from PDF body:** duplicate app name, legal operator, generated-by tables (`pdfDocumentMetaTableHtml` empty), grey body disclaimers.

**One-page compaction:** `pdfPageStyles` + `pdf-flow` wrapper — smaller headings (14pt / 9pt), tighter table padding (8.5pt), `notes-compact`, omitted empty sections via `row()` / `section()`. Long content uses natural **page breaks** (continuation page) instead of clipping.

### Payment Request — form changes

| Removed | Notes |
|---------|--------|
| Status | No workflow states |
| Remarks / `notes` | Always `null` on save |
| Follow-up reminder | Always `null` |
| Invoice amount, pending-since, payment request date | Not collected |
| Always-visible bank fields | Replaced by toggle |

| Required | Optional |
|----------|----------|
| Party / customer name | Invoice date, due date, contact person |
| Invoice / bill number | |
| Pending amount | |
| Request note | Auto-filled: *This is a payment request against Invoice/Bill No. ___ for the pending amount of ₹___.* — user may edit |

**Bank details:** question *“Add bank details to this PDF?”* — default **No**. **Yes** opens expandable panel **Bank details for PDF** with helper copy; **No** collapses, clears fields, excludes from PDF/share.

### Payment Request — bank details UI (May 2026)

| Item | Detail |
|---|---|
| **Root cause** | Bank fields sat on `surfaceMuted` inside a muted panel with `TextField` borders transparent — inputs were effectively invisible. |
| **Input component** | `FormField` (= enhanced `TextField`): visible `divider` border, `surface` fill, **primary** focus ring, error state, placeholders |
| **Panel** | `PaymentRequestFields.tsx` — `surfaceElevated` card, soft elevation, `LayoutAnimation` on Yes/No |
| **Validation** | When Yes: IFSC validated only if entered (11-char, auto-uppercase); UPI only if entered; **no** required bank fields — empty bank does not block save. Messages: `composer.bankIfscInvalid` / `composer.bankUpiInvalid` (en/hi via `errorFor`) |
| **Payload** | `buildPaymentBankDetailsFromForm()` — sets `includeBankDetailsInPdf` only when Yes **and** at least one bank value |
| **PDF / share** | `paymentBankDetailsHasContent()` — section omitted if no rows; `row()` skips blank cells (no empty headings) |
| **Files** | `PaymentRequestFields.tsx`, `TextField.tsx`, `FormField.tsx`, `paymentBankDetails.ts`, `validation.ts`, `payload.ts`, `normalize.ts`, `businessEntryPdfTemplate.ts`, `paymentShareMessage.ts`, `BusinessComposerForm.tsx`, `en.ts` / `hi.ts` |

**Manual test (logic review):** Yes → visible boxed fields + focus; invalid IFSC blocks save; all blank with Yes still saves without bank block in PDF; No → panel hidden. Device QA recommended.

`npm run typecheck` **PASS**.

### Post-save success panel

`ComposerSaveSuccess`: View record · View/Generate PDF · Share · **Edit** · Add another · Go to dashboard (no auto-redirect to You). `regenerateEntryPdf` used when no `pdfUri` yet.

### Key files

- `src/domain/documentHistory.ts`, `src/services/documentHistory/index.ts`
- `src/services/diary/mergeEntryUpdate.ts`, `regenerateEntryPdf.ts`
- `src/services/pdf/businessEntryPdfTemplate.ts`, `pdfPageStyles.ts`
- `src/components/composer/PaymentRequestFields.tsx`, `src/components/ui/FormField.tsx`, `ComposerSaveSuccess.tsx`
- `src/utils/businessEntry/paymentBankDetails.ts`
- `src/utils/businessEntry/formValuesFromEntry.ts` (bank fields flattened for edit)

### Commands

| Command | Result |
|---------|--------|
| `npm run typecheck` | Run after pull — expected **PASS** |

### Manual test matrix — Payment Request PDF

1. **Create (minimal):** party, invoice no., pending amount → Save → success panel (not You); note auto-filled; PDF title *Payment Request Against Pending Invoice*; no bank block; footer legal text only at bottom.
2. **Bank toggle No (default):** bank section hidden in form; PDF/share have no bank rows.
3. **Bank toggle Yes:** fill required bank fields → PDF shows *Bank / payment details*; share text includes bank block.
4. **Edit:** change pending amount → save → `versionNumber` increments; re-export PDF → **Document history** block shows last edited + field summary.
5. **Regenerate:** delete/clear `pdfUri` or use Generate PDF on success panel → `pdfGenerationHistory` appends; `firstGeneratedAt` unchanged after first run.
6. **Validation:** empty pending amount → scroll/focus + inline error, no save.

**Status:** Implementation complete in repo; **device manual pass not executed** in this session.

---

## P0 PDF / amount / picker pass (2026-05-31)

### Root cause — Payment Request showed wrong amount (e.g. `0.2` / `2` instead of ₹2,00,000)

`Number("2,00,000")` in JavaScript parses only the substring **before the first comma** → **`2`**, not `200000`. That wrong value flowed through:

- `PaymentRequestFields` auto-note (`Number(pendingAmount)`)
- Zod `positiveAmount` preprocess (`Number(val)`)
- `formValuesToEntryParts` / payload save
- PDF rows, share text, and `buildAutoPaymentRequestNote` (raw number in string)

Indian grouping commas were treated as invalid separators instead of stripped before parse.

### Fix — centralized INR utility

| File | Role |
|------|------|
| `src/utils/money/inr.ts` | `parseINRInput()`, `parseINRInputOrNaN()`, `formatINR()` — amounts stored as **decimal rupees** |
| `src/utils/money/inr.test.ts` | Regression cases (run `npm run test:inr`) |

Wired into: `validation.ts` (`inrAmountField`), `payload.ts`, `PaymentRequestFields`, `paymentRequestNote.ts`, `paymentShareMessage.ts`, `businessEntryPdfTemplate.ts`, `display.ts`, `BusinessEntryDetailBody.tsx`, `normalize.ts`, `documentHistory` summaries, `professionalPack/validation.ts`, cash composer preview.

**Composer:** live **Amount preview** (`composer.amountPreview`) on Payment Request and Cash Record while typing.

**Example note after fix:**  
`This is a payment request against Invoice/Bill No. SLFY2526/0014 for the pending amount of ₹2,00,000.`

### `+ New Record` picker sheet

| Before | After |
|--------|--------|
| ~55% height, `LIST_MAX_HEIGHT` 52% scroll | **90%** screen height (`SHEET_OPEN_RATIO = 0.9`), max **92%** |
| Options half-cut | `flex: 1` list inside fixed-height sheet; scroll only on small devices |
| Open from ~35–55% offset | Opens from full snap height with 300ms cubic ease-out |

File: `src/components/composer/ComposerPickerSheet.tsx`

### PDF footer pinned to A4 bottom

| Before | After |
|--------|--------|
| Footer in content flow (`pdfFlowDocumentWrap`) — floated under body | `pdfPrintDocumentWrap(content, footer)` — body in `.pdf-print-body` with **30mm bottom reserve**; footer uses `.pdf-page-fixed-footer` (`position: fixed; bottom: 8mm`) |
| Grey disclaimer in pro-pack body | Removed `<p class="matter-disclaimer">` from `professionalPackPdfTemplate.ts` body |

Templates updated: `businessEntryPdfTemplate.ts`, `diaryEntryPdfTemplate.ts`, `professionalPackPdfTemplate.ts`, `pdfPageStyles.ts`, `pdfLayout.ts`.

### Commands

| Command | Result |
|---------|--------|
| `npm run test:inr` | All listed parse/format cases **PASS** |
| `npm run typecheck` | **PASS** (run after pull) |

### Manual verification (device)

1. **+ New record** — sheet opens ~full screen; all 10 options visible without dragging first.
2. **Payment request** — enter `2,00,000` → preview `₹2,00,000`; note/PDF/share match.
3. **PDF** — footer grey text at **bottom of page**, not under title block.

**Status:** Code + INR unit tests pass; **device PDF sample not captured** in CI session.

---

## P0 navigation + Appearance pass (2026-05-31)

### Navigation architecture

| Layer | Role |
|-------|------|
| `app/index.tsx` | Boot router (auth / profile gate) |
| `app/(auth)/*` | Login, OTP, UEID, complete-profile |
| `app/(app)/_layout.tsx` | Authed stack (`slide_from_right`) |
| `app/(app)/(tabs)/*` | Calendar · You · Settings (glass tab bar) |
| `app/(app)/composer`, `diary`, `letterhead`, `professional-pack`, `settings/*` | Feature stacks |

**Policy:** `router.back()` when `router.canGoBack()`; else context fallback via `from` query param. No blanket `replace('/(tabs)/you')` on generic back (Header fixed).

### `useSmartBack()` — `src/navigation/useSmartBack.ts`

- `resolveSmartBackFallback(from)` → `you` \| `calendar` \| `diary` \| `map` \| `letterhead` \| `pro_pack` \| `settings`
- Unsaved forms: `confirmUnsavedChanges()` — **Discard** / **Continue editing**; pro-pack adds **Save draft** (draft already auto-persisted)
- iOS swipe-back disabled while `dirty` (`gestureEnabled: false`)
- `beforeRemove` listener for stack pops
- Entry detail passes `from` when opening: Calendar → `from=calendar`, History → `from=diary`, You → `from=you`, Map → `from=map`
- Composer success: back pops composer (returns to You); **View record** → detail with `from=you`
- `ComposerPickerSheet`: hardware back still closes sheet first (unchanged)

### Appearance / theme

| Piece | Detail |
|-------|--------|
| Storage key | `vyd_theme_mode_v1` (`APPEARANCE_STORAGE_KEY`) — values `system` \| `light` \| `dark` |
| Default | `system` |
| Provider | `ThemeProvider` / `useTheme()` / `useAppTheme()` alias |
| Resolved | `resolvedMode` drives `lightColors` / `darkColors` |
| System sync | `Appearance.addChangeListener` + `AppState` refresh on resume when mode is `system` |
| Glass tab bar | `GlassTabBarBackdrop` uses `resolvedMode` tint/intensity (not raw OS-only) |
| Settings UI | Three radio options on Settings tab (already wired to `setMode`) |

### Commands

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** (runs typecheck) |
| `npx expo-doctor` | **1 fail** — pre-existing `expo-blur@14` vs SDK 54 expects `~15.0.8` (not changed this pass) |

### Manual acceptance (device)

- [ ] Theme: System / Light / Dark immediate; restart retains choice; System tracks device after resume
- [ ] You `+` sheet → back closes sheet
- [ ] Composer dirty back → discard dialog; success back → leaves composer
- [ ] Calendar → entry → back → Calendar
- [ ] History → entry → back → History
- [ ] Android hardware back on above flows
- [ ] iOS swipe on clean stacks; blocked on dirty composer

**Status:** Navigation + theme code complete; **full device matrix not run** in CI.

### At-a-Glance period header (2026-05-31)

Detail screens (`/at-a-glance/today`, `this-week`, `upcoming`) show a **date-range pill** aligned with filter bounds from `getAtAGlanceBounds()` in `atAGlanceService.ts`.

| View | Pill | Context line |
|------|------|----------------|
| Today | Single day (`d MMM yyyy`) | `atAGlance.period.todayOn` |
| This week | `formatRollingWeekRange(weekStart, todayStart)` | `atAGlance.period.recordsFrom` |
| Upcoming | (none) | `atAGlance.upcoming.periodHint` |

**Rolling week logic:** `weekStart = startOfDay(today) − 6 days`, inclusive through today (`ms < todayEnd`) — same as `isInWeek()`.

**Files:** `src/utils/date/rollingWeekRange.ts`, `atAGlancePeriodDisplay.ts`, `AtAGlancePeriodHeader.tsx`, `app/(app)/at-a-glance/[view].tsx`, i18n `atAGlance.period.*`.

**Tests:** `npm run test:week-range` (e.g. `1 Jun – 7 Jun 2026`, `30 May – 6 Jun 2026`, year boundary).

**Custom range (This week only):** `AtAGlanceWeekRangeControl` — chips **This week** / **Custom range**, from/to date pickers, **Apply**, shortcut **Previous 7 days**. Filter uses same `inWeekSpan` logic with `AtAGlanceWeekRangeFilter`; pill updates via `getAtAGlancePeriodDisplayForRange`. End date capped at today; max span 366 days.

### Multi-draft system (2026-05-31)

Premium **user-saved drafts** (many per record type) plus separate **recovery** autosave (debounced, not listed).

#### Files changed

| Area | Path |
|---|---|
| Schema V3 | `src/localDb/schema.ts`, `init.ts` — `title`, `status`, `source`; partial unique index on recovery only |
| Repository | `src/repositories/formDraftsRepository.ts` |
| Draft services | `src/services/drafts/*` |
| Autosave | `src/hooks/useFormAutosave.ts` → `saveRecovery` only |
| Composer | `app/(app)/composer/[type].tsx`, `BusinessComposerForm.tsx` (`reset` on load) |
| UI | `DraftUnsavedSheet`, `DraftSavedSuccess`, `DraftListRow`, `YouSavedDraftsSection` |
| Drafts page | `app/(app)/drafts/index.tsx` |
| You tab | `app/(app)/(tabs)/you.tsx` |
| Search | `globalSearchRepository.ts`, `routing.ts`, `types.ts`, `draftSearch.ts` |
| Boot | `BootDraftContinuationSheet.tsx`, `resolveBootRoute.ts`, `draftBootSnooze.ts`, `app/index.tsx` |
| i18n | `drafts.*`, updated `boot.draftContinuation.*` |

#### Data model (`form_drafts`)

- `source`: `user` (listed, searchable) \| `recovery` (crash/background, one per scope)
- `status`: `active` \| `converted` \| `discarded`
- `title`: auto-generated from filled fields
- User drafts: unique `id`; multiple rows per `scope_key` (entry type)
- Recovery: unique per `(user_id, draft_kind, scope_key, entry_id)` when `source = recovery`

#### Save Draft (composer)

1. Header **Save draft** or back-sheet **Save draft**
2. `isDraftPayloadMeaningful()` — empty form → error, no fake success
3. `saveUserDraft` + `clearRecovery` + search index invalidate
4. `DraftSavedSuccess`: Continue editing / View drafts / Add another / Dashboard
5. Final **Save** → `markConverted` on `draftId`, `clearRecovery`, existing validation unchanged

#### Resume

- Route: `/(app)/composer/[type]?draftId=…`
- Loads `getById` payload; `reset(mergedDefaults)` restores fields
- New compose (no `draftId`): merges **recovery** only, not other user drafts

#### Dashboard

- `YouSavedDraftsSection`: hidden when count 0; else count + latest 3 + View all

#### Global search

- `kind: form_draft`, snippet includes **Draft** chip text; routes via `hrefForDraft`
- Discarded/converted excluded from index

#### Boot prompt

- Compact card; **Continue** / **Later** (24h snooze) / **View drafts**
- Shows latest **user** draft only

#### Manual tests

- [ ] Payment Request: two drafts (different invoice nos) → both in Drafts page → resume each
- [ ] Freight Details: save draft → back → resume fields
- [ ] Cash Paid: save draft without final validation → final save still enforces 30-day rule
- [ ] GST Reminder: empty save draft → “Nothing to save yet”
- [ ] Search by party/invoice → draft row labelled Draft
- [ ] Convert draft to record → draft no longer in list/search
- [ ] Double-tap Save draft / Save record → single write

#### Limitations

- Letterhead / Professional Pack: pro pack still uses legacy AsyncStorage autosave; user-draft migration to SQLite planned same pattern
- Attachments in drafts: metadata only; OS may require re-pick files (message not yet wired on all screens)
- Rename draft title: list shows auto-title; `updateUserDraftTitle` API exists for future UI

### Swipe-to-delete (user-created records)

#### Reusable UI

| Piece | Path |
|-------|------|
| Row wrapper | `src/components/records/SwipeToDeleteRow.tsx` |
| Delete action (red + bin) | `src/components/records/SwipeDeleteAction.tsx` |
| One-open-row registry | `src/components/records/swipeDeleteRegistry.ts` |
| Confirm + execute hook | `src/hooks/useRecordDelete.ts` |
| Repository deletes | `src/services/records/permanentDeletion.ts` (via `userContentDelete.ts`) |
| Target mappers | `src/services/records/deleteTargets.ts` |
| i18n | `swipeDelete.*` in `en.ts` / `hi.ts` |

RTL swipe reveals **Delete** on the right (`ReanimatedSwipeable` + `renderRightActions`). Tap bin → `Alert` confirmation (draft vs record copy) → `deleteRecordPermanently()` → success banner; no undo snackbar (confirmation-first).

#### Screens integrated

- **You tab:** Saved drafts preview, Needs attention (entry + pro pack), Recent activity, Saved PDFs preview
- **Drafts page:** `app/(app)/drafts/index.tsx`
- **All Records:** `app/(app)/diary/index.tsx`
- **Entry detail:** delete button uses `deleteUserContent` (same search/reminder behaviour)
- **At-a-Glance:** `app/(app)/at-a-glance/[view].tsx`
- **Calendar day lists:** `app/(app)/(tabs)/calendar.tsx` (user records only)
- **Global search:** `app/(app)/search.tsx` (incl. `pdf_history` → parent record)
- **Letterhead history:** `app/(app)/letterhead/history.tsx` (swipe + existing delete button)
- **Professional pack history:** `app/(app)/professional-pack/history.tsx`

#### Entity types

| Type | Delete method | Notes |
|------|---------------|--------|
| `diary_entry` | `hardDelete` (deleteDoc / AsyncStorage filter) + files/insights/search cleanup | Cancels reminder; removes PDFs/attachments under app dirs |
| `form_draft` | `formDraftsRepository.discardDraft` | Permanent local discard (unchanged) |
| `letterhead_document` | `remove` + local PDF cleanup | Template config untouched |
| `professional_pack` | `hardDelete` + files/master-data cleanup | |
| `purchase_order` | `remove` via central service | Serial retained; cancel ≠ delete |
| `customer_credit` | `remove` + photo/PDF cleanup | Closed/paid status ≠ delete |

**Offline policy (Option B):** local payload and files removed immediately; sync queue carries minimal `{ id }` only; `syncEngine` calls `hardDelete` when online. UI copy: *"Deleted from this device. Cloud deletion will complete when you are online."*

**User-facing copy (records):** *"Delete permanently?"* / *"This will remove the record from Vyaamikk Diary. You will not be able to recover it."* / *"PDFs or documents already shared outside the app cannot be recalled."* Success: *"Record permanently deleted."*

**Not stored after delete:** no `deletedAt` tombstones with business content; Business Insights **Records deleted** tile removed.

#### Intentionally excluded

Statutory Information rows (`entityType === statutory_info`), settings/profile/legal rows, calendar date cells, map markers, empty states, composer prompts, bottom tabs.

#### Refresh after delete

Lists call screen `reload` / `refresh` / `load`; search invalidates index on delete; calendar hook reloads on focus; dashboard `refreshDashboard` refreshes entries + letterhead + pro packs.

#### Performance

`FlatList` / `SectionList` unchanged; swipe wrapper is memoized; single open row via registry; no blur on action panel; light haptic on delete tap (iOS).

#### Manual tests (device)

- [ ] Draft: swipe on Drafts page + You preview → confirm → gone from list/search/boot prompt
- [ ] Payment request record: Diary history + search
- [ ] Freight record: Calendar day list + delete → dot/count updates on reload
- [ ] Cash paid: At-a-Glance today
- [ ] Letterhead document: Letterhead history swipe
- [ ] Search result row disappears after delete
- [ ] Statutory row on calendar: **no** swipe delete
- [ ] Pro pack: history + You attention swipe

### Premium Indian Business Palette (visual identity)

Controlled accent upgrade — core violet/indigo identity preserved; no full-screen colour or mandala redesign.

#### Design tokens

| Layer | Path |
|-------|------|
| Base palettes (ivory/lilac light, violet-black dark) | `src/theme/palettes.ts` |
| Category accents (light + dark) | `src/theme/categoryAccents.ts` |
| Semantic brand/surface/text | `src/theme/brandTokens.ts`, `useBrandTokens()` |
| Resolvers (entry type → accent) | `src/theme/categoryAccentResolver.ts` |
| UI chip / pattern | `CategoryAccentChip`, `SubtlePatternCorner` |

Token keys: `brand.primary`, `surface.base/card/glass`, `text.primary/secondary`, `accent.payment|cash|freight|material|staff|work|statutory|letterhead|proPack|reminder|map`.

#### Accent palette (light / dark main)

| Category | Light | Role |
|----------|-------|------|
| Payment | `#0D6E5F` teal | chips, borders, icons |
| Cash | `#047857` + gold highlight | |
| Freight | `#C2410C` amber | |
| Material | `#9A3412` copper | |
| Staff | `#1D4ED8` blue | |
| Work | `#3B41C5` indigo | drafts, default |
| Statutory | `#1E3A5F` navy + `#D97706` saffron strip | |
| Letterhead | `#6B21A8` | |
| Pro pack | `#4C1D95` plum | |
| Reminder | `#B45309` | |
| Map / today stat | `#0F766E` teal | calendar dots, map GPS pins |

Text on chips stays **neutral** (`colors.text`); accents used for soft fills, left strips, icons, dots — not long-form text backgrounds.

#### Where applied

- **+ New record** picker rows — 3px left accent strip per category
- **Record type chips** — `EntryRow`, `CategoryAccentChip`, diary filter `Pill` (active)
- **Dashboard** — stat tile top strip (today=map, week=work, upcoming=reminder)
- **At-a-Glance / Search / Calendar lists** — left strip + icon tint + chip
- **Calendar dots** — category-coded multi-dot colours
- **Map markers** — `mapMarkerColorForEntryType`; PIN approximate stays saffron
- **Drafts** — draft chip uses work/violet accent
- **Statutory tab** — navy/saffron chips, card left strip, header pattern, empty state
- **Save success** — `PremiumSuccessPrompt` accent strip + subtle corner pattern by entry type

#### Mandala / pattern (subtle only)

- `SubtlePatternCorner` — low-opacity radial dots in empty states, success prompts, statutory header
- **Not used on:** composer forms, record detail, PDF templates, search field areas, payment/cash forms

#### Intentionally unchanged

Record schemas, PDF HTML engine, validation, statutory/calendar/search/sync logic, navigation, primary CTA gradient (`premiumTokens.ts`).

#### Performance

Accents are static hex lookups + memoized hooks; no extra list re-renders beyond existing row components; patterns are lightweight `View` dots (no SVG/blur in lists).

#### Manual visual check

- [ ] Light + dark + system: You tab, + picker, diary list, calendar dots, statutory cards
- [ ] Forms still white/clean; PDF export unchanged visually
- [ ] Long diary list scroll remains smooth

### Vyaamikk Signature Layer

Restrained premium layer on top of the Indian Business Palette — no layout or logic changes.

#### New components / tokens

| Piece | Path |
|-------|------|
| Gradient + pattern tokens | `src/theme/signatureLayer.ts` |
| Hero gradient surface | `src/components/signature/SignatureHeroSurface.tsx` |
| Jaali / ledger dot texture | `src/components/signature/LedgerJaaliPattern.tsx` |
| Press feedback helper | `signaturePressOpacity()` |

#### Areas upgraded

- **You dashboard** — `UserGreetingHeader` in signature hero gradient; `SmartHeadline` icons + accent rings; `DashboardPreviewRow` left strip + category icon tints; stat tiles (prior palette pass)
- **Statutory tab** — hero band around header; empty state with shield icon
- **Business Identity** — hero intro band; `IdentityPreviewCard` ledger texture + violet strip (preview only; form fields unchanged)
- **Success prompts** — `PremiumSuccessPrompt` gradient title band + check icon ring (category accent from entry type)
- **Empty states** — icon ring, jaali texture, concise action (dashboard + statutory)

#### Micro-interactions

- Avatar press, dashboard preview rows: opacity fade via `signaturePressOpacity` (no scale, no layout shift)
- Existing `PremiumCard` / button press behaviour unchanged

#### Intentionally avoided

Composer forms, record detail bodies, diary/search/calendar long lists, PDF HTML, payment/cash field screens, map list rows, navigation structure, sync/auth/statutory engines.

#### Performance

- Patterns are static `View` dots (no SVG, no blur, no Reanimated loops)
- Signature surfaces only on headers / empty states / success screens — not virtualized list cells (except small capped dashboard preview rows on You tab)
- `LedgerJaaliPattern` and `SubtlePatternCorner` use `pointerEvents="none"`

#### Visual QA (device)

- [ ] Light mode: You greeting hero, section headers with icons, identity preview card
- [ ] Dark mode: same surfaces — gradients remain subtle, text readable
- [ ] System theme switch: no flash or broken borders
- [ ] Save record success: gradient band + accent check icon
- [ ] Statutory header: navy/saffron texture visible but not loud

### Vyaamikk Executive Experience Layer

Final premium pass before QA freeze — builds on Signature Layer + Indian Business Palette. **No product features, schema, PDF, form, sync/auth, or navigation changes.**

#### New tokens / components

| Piece | Path |
|-------|------|
| Executive gradients, search glow, press feedback, section rhythm | `src/theme/executiveLayer.ts` |
| Card depth hierarchy (Levels 1–4) | `src/theme/cardDepth.ts` |
| Status chips (draft, synced, PDF, GPS, etc.) | `src/components/executive/ExecutiveStatusChip.tsx` |
| Trust cues (one-line, non-legal) | `src/components/executive/ExecutiveTrustCue.tsx` |
| Compact section empty hints | `src/components/executive/ExecutiveInlineEmpty.tsx` |
| i18n | `executive.*` in `src/i18n/locales/en.ts` / `hi.ts` |

#### Screens / surfaces upgraded

| Area | Changes |
|------|---------|
| **You dashboard** | Executive hero (`UserGreetingHeader` + `SignatureHeroSurface` with `executiveHeroGradient`); command-centre subtitle; last-active status chip; premium search bar (glow, icon ring, hint line); `SmartHeadline` executive spacing; stat tiles Level-2 depth + press feedback; preview rows Level-3 depth; inline empties for Needs Attention / Saved PDFs; PDF preview status chips |
| **Saved Drafts** | Dashboard rows use `ExecutiveStatusChip`; drafts list empty → `EmptyState` |
| **At a Glance** | `AtAGlancePeriodHeader` accent pill + icon ring |
| **Statutory Information** | Internal section labels → accent dot + uppercase rhythm (hero band unchanged) |
| **Calendar & Maps** | Hero header band; executive segmented control; calendar card Level-2 depth; existing panel crossfade retained |
| **Business Identity** | Preview card Level-2 depth; trust cue under preview (form fields untouched) |
| **Success prompts** | `PremiumSuccessPrompt` executive gradient + one-shot fade-in; optional trust lines on composer save + draft save |
| **Empty states** | `EmptyState` Level-2 card shell (dashboard, drafts, calendar day, statutory, diary, search, at-a-glance) |

#### vs Signature Layer

- Deeper hero/search gradients and unified **card depth system** (Levels 1–4)
- **Executive section headers** — tighter rhythm, icon rings with borders, accent strips
- **Status chips** and **trust cues** on high-value surfaces only
- **Press feedback** adds subtle scale (0.985) in addition to opacity on hero/search/stat/preview cards
- **Success prompts** fade in once (280 ms), no looping motion
- Dark palette refinements: charcoal surfaces (`surfaceMuted` #181C34), toned freight/material accents

#### Intentionally avoided

Composer forms, record detail bodies, payment/cash inputs, PDF HTML/templates, diary/search/calendar **long list rows** (no gradients/patterns/heavy blur inside FlatList/SectionList cells), map cluster list internals, navigation/tab order, business schemas, sync/auth/statutory engines, delete-account flows.

#### Performance safeguards

- Card depth = static `ViewStyle` spreads; no Reanimated loops
- Success fade: single `Animated.timing` on mount, native driver
- Segmented control: `LayoutAnimation` only on tap (not continuous)
- Patterns remain lightweight dot grids with `pointerEvents="none"`
- Long lists unchanged — only strip/icon tint/chip accents on rows

#### Light / dark observations

- **Light:** ivory `#FAFAF8` background; white Level-2 cards with hairline borders; search glow indigo at ~8% opacity; text hierarchy strong on section headers
- **Dark:** violet-black `#070810`; elevated surfaces `#12152A` / `#181C34`; search border/glow softened indigo; freight/material accents muted vs prior Signature pass; chips use soft category tints with readable micro text

#### Unchanged (confirmed)

Record schemas, PDF generation bodies, form validation, sync/auth, statutory logic, calendar/map routing, search indexing, startup, delete-account, business flows, bottom tab layout, + New Record CTA footprint.

#### QA freeze recommendation

**Yes — freeze visual language for QA** after device pass on You tab (light + dark), Calendar segmented control, composer save success, identity preview, and scroll performance on diary list. Further visual changes risk churn without user-facing benefit.

#### Manual visual check

- [ ] Light + dark: You hero, search bar focus presence, section headers, inline empties
- [ ] Calendar hero + mode switch transition; map panel crossfade
- [ ] Draft save + record save success fade + trust lines
- [ ] Identity preview card depth; form fields still plain
- [ ] Diary long list scroll — no regression
- [ ] PDF export appearance unchanged

### Core Forms, Drafts, Back Navigation & PDF Reliability Pass (2026-06-02)

Product-critical stabilisation — **no visual redesign**, no schema changes unless required for confirmed bugs.

#### Audit summary (pre-fix)

| Flow | Route | Draft | Back (before) | Key gaps found |
|------|-------|-------|---------------|----------------|
| Professional Brief | `/(app)/professional-pack/*` | Yes | Often → You | Category stack OK; gate back from picker fixed |
| Work Update | `composer/work_update_issue` | Yes | → You (skipped picker) | Date helpers present |
| Staff Note | `composer/staff_matter` | Yes | → You | Missing form lead; fields not scroll-anchored |
| Cash Paid | `composer/business_cash_given` | Yes | → You | 30-day policy + recorded-on OK in code |
| Payment Request | `composer/payment_request` | Yes | → You | Minimal fields OK |
| Freight Details | `composer/outward_freight_details` | Yes | → You | Dispatch link OK |
| Material Dispatch | `composer/material_dispatched` | Yes | → You | PIN sections OK |
| Material Receipt | `composer/material_received` | Yes | → You | Quality toggle OK |
| Letterhead Matter | `/(app)/letterhead/*` | Yes | → You | PDF template img reliability fix applied |

#### Fixes in this pass

| Area | Files | Change |
|------|-------|--------|
| **Back → picker** | `composerPickerReturn.ts`, `you.tsx`, `composer/[type].tsx`, `ComposerPickerSheet.tsx`, `letterhead/index.tsx`, `professional-pack/index.tsx` | Back from composer/letterhead/pro-pack (opened via + picker) reopens picker; Work & Team sub-types reopen expanded |
| **Staff form** | `BusinessComposerForm.tsx`, `en.ts`, `hi.ts` | Lead text, recorded-on hint, event-date label + policy helper, scroll anchors on all fields |
| **Validation scroll** | `BusinessComposerForm.tsx` | Generic `field()` registers anchors for scroll-to-error |
| **Letterhead PDF** | `letterheadPdfService.ts` | Prefer inline data-URI `<img>` for template (expo-print WebView reliability) |

#### Form-readiness matrix

Legend: ✅ verified in code + prior manual | ⚠️ needs device retest | — not applicable

| Form | Required fields | Date policy | Draft | Save prompt | Back | PDF | Edit history | Search | Calendar |
|------|-----------------|-------------|-------|-------------|------|-----|--------------|--------|----------|
| Work Update | work OR issue | Event past 15d | ✅ | ✅ | ✅ picker | ✅ | ✅ if edited | ✅ | ✅ if reminder |
| Staff Note | name, details | Event past 15d | ✅ | ✅ | ✅ picker | ✅ | ✅ | ✅ | — |
| Cash Paid | amount, to, purpose, pay date | 30d past only | ✅ | ✅ | ✅ picker | ✅ immutable date | ✅ | ✅ | — |
| Payment Request | party, invoice, amount | Created = today | ✅ | ✅ | ✅ picker | ✅ | ✅ | ✅ | — |
| Freight | bill, delivery, boxes, weight | Event | ✅ | ✅ | ✅ picker | ✅ | ✅ | ✅ | — |
| Dispatch | party, material, qty, delivery PIN | Event past 15d | ✅ | ✅ | ✅ picker | ✅ | ✅ | ✅ | — |
| Receipt | supplier, material, qty | Event past 15d | ✅ | ✅ | ✅ picker | ✅ | ✅ | ✅ | — |
| Letterhead | body | User letter date | ✅ | share flow | ✅ picker | ⚠️ retest template | — | ✅ | — |
| Pro Pack (×N matters) | per-matter schema | per matter | ✅ | ✅ | ✅ index→picker | ✅ | ✅ | ✅ | ✅ if due |

#### Draft implementation status

- **User drafts** (`source: user`): Save Draft header + unsaved sheet; listed on You + Drafts page; searchable as Draft
- **Recovery** (`source: recovery`): debounced autosave; not listed; merged on compose open
- **Convert on save**: `markConverted` clears active draft
- **Boot prompt**: `BootDraftContinuationSheet` — compact card (not full-screen)

#### Remaining limitations (honest)

- Letterhead: single-page clip if body exceeds writable area (warn on create; multi-page template repeat not yet implemented)
- Staff follow-up reminder: describe in details field (no separate reminder toggle yet — avoids schema change)
- Pro pack: device retest each matter category for blank-save guards
- PDF samples: no CI screenshots — **manual export required** on device

#### Manual tests to run next

1. + New Record → Work & Team → Staff → back → picker shows Work & Team expanded
2. + New Record → Payment Request → back → full picker (not You)
3. Save Draft on half-filled form → appears on You + Drafts + search
4. Letterhead: upload template → create matter → PDF shows full-page letterhead image
5. Cash Paid: date >30 days blocked with inline helper

#### Next safest priority

Device QA on back-navigation + letterhead PDF, then pro-pack matter validation pass per category.

### Device QA — Core Forms Stabilisation (2026-06-02)

#### Environment

| Item | Detail |
|------|--------|
| **Platform** | iOS via **Expo Go** (bundler active in dev session; `local-mock` auth backend) |
| **Android** | Not exercised in this QA session |
| **Automated checks** | `npm run typecheck` PASS · `npm run test:cash-date` PASS · `npm run test:draft-meaningful` PASS |
| **Interactive UI** | Agent cannot drive the simulator UI directly; results combine **automated tests**, **code-path verification**, and **letterhead HTML smoke test**. **You should confirm** the checklist below on your device. |

#### Bugs found

| # | Severity | Flow | Finding |
|---|----------|------|---------|
| B1 | Medium | Pro Pack → category → matters → back (empty stack) | `matters.tsx` used `backFrom="you"` only — could skip picker when stack was empty |
| B2 | Medium | Pro Pack form back after picker | Form did not call `requestComposerPickerReturn` when `fromPicker=1` |
| — | Info | GST Reminder via + New Record | **Not in picker** (removed earlier); use **Statutory Information** tab — not a regression |

#### Bugs fixed (this QA pass)

| Bug | Fix |
|-----|-----|
| B1 | `professional-pack/matters.tsx` — `handleBack` + pass `fromPicker` to form |
| B2 | `professional-pack/form.tsx` — `navigateBack()` + `fromPicker` param |

#### 1. Back navigation (+ New Record)

| Flow | Result | Notes |
|------|--------|-------|
| Work & Team → Staff | **PASS (code)** | `pickerReturn=work_team` + `consumeComposerPickerReturn` on You focus |
| Work & Team → Work Update | **PASS (code)** | Same as Staff |
| Letterhead | **PASS (code)** | Gate `fromPicker=1` → back requests picker |
| Professional Pack | **PASS (code)** after B1/B2 fix | Index + matters + form chain |
| Payment / Freight / Cash / Dispatch / Receipt | **PASS (code)** | `pickerReturn=picker` on composer routes |
| GST Reminder | **N/A** | Not offered in + picker |

**Verdict:** Back navigation should be **consistent** for all composer types and letterhead/pro-pack entry from picker — **retest Staff path on device** after reload.

#### 2. Staff form

| Check | Result |
|-------|--------|
| Helper copy (`staffFormLead`) | **PASS (code)** — EN/HI strings present |
| Recorded-on vs event date | **PASS (code)** — `ComposerRecordedOnField` + `staffEventDate` + hints |
| 15-day policy hint | **PASS (code)** — `staffEventDateHint` |
| Scroll/focus on validation | **PASS (code)** — `field()` uses `fieldBindings.wrap`; order `entryDate`, `staffName`, `matterDetails` |

**Device retest:** Submit empty form → should scroll to first error field.

#### 3. Drafts

| Check | Result |
|-------|--------|
| Save Draft (composer) | **PASS (code)** — header + `DraftUnsavedSheet` |
| You dashboard / Drafts page | **PASS (code)** — `YouSavedDraftsSection`, `drafts/index` |
| Global Search | **PASS (code)** — `indexFormDraft` for `source === "user"` |
| Restore fields | **PASS (code)** — `draftId` loads full `payload` |
| Convert → draft removed | **PASS (code)** — `markConverted` on save |
| Pro pack / letterhead drafts | **PARTIAL** — routes exist in `draftRoutes`; **device retest** per kind |

**Verdict:** Composer drafts are **production-usable** in code; pro-pack/letterhead draft UX needs **your device confirmation**.

#### 4. Letterhead PDF

| Check | Result |
|-------|--------|
| Template in PDF (data URI) | **PASS (automated smoke)** — `buildLetterheadHtml` embeds inline `data:image/png;base64,...` in `<img class="letterhead-bg">` |
| file:// regression | **Mitigated (code)** — data URIs returned as-is; file fallback only for non-data paths |
| Hindi/English body | **PASS (code)** — `escapeHtml` + Devanagari font stack in HTML |
| Long body overflow | **KNOWN LIMIT** — single page, `overflow: hidden`; create screen warns — **not fixed in this pass** |
| Footer at bottom | **REMOVED (2026-06-03)** — Letterhead PDFs have **no** Vyaamikk/platform footer; see below |

**Verdict:** Letterhead PDF should be **reliable on iOS and Android** for normal template sizes when config uses `imageDataUri` — **confirm visually** on device. Multi-page overflow still **risky**.

##### Letterhead PDF — zero platform branding (2026-06-03)

| Item | Detail |
|------|--------|
| **Scope** | Letterhead export only — Payment Request, Cash Paid, Freight, Pro Pack, etc. **unchanged** |
| **Removed from PDF** | `pdfFooterHtml()` — “Generated using Vyaamikk Diary”, SPECIAL SOFTWARES, Ananya LLP operator line, Vyaamikk ID, user name/timestamp footer, grey disclaimer, page footer CSS |
| **Kept in PDF** | User-uploaded letterhead `<img class="letterhead-bg">` + matter in writable margins only |
| **Internal app** | Document history, `createdAt`, regenerate/share, SQLite/Firestore records — unchanged; not rendered on PDF |
| **No template** | Create/regenerate routes to `/letterhead/setup` if `imageDataUri` missing (no branded fallback) |
| **Continuation pages** | V1 still single-page clip; future pagination must repeat user template only — **no** platform footer |
| **Files** | `src/services/pdf/letterheadPdfService.ts`, `app/(app)/letterhead/create.tsx`, `app/(app)/letterhead/history.tsx` |
| **Test** | `npm run test:letterhead-pdf` — source regression: no `pdfFooterHtml` / platform strings in letterhead export path |

#### 5. Cash Paid

| Check | Result |
|-------|--------|
| Today allowed | **PASS** — `cashPaidDate.test.ts` |
| 30 days ago allowed | **PASS** — unit test |
| 31 days ago blocked | **PASS** — unit test |
| Future blocked | **PASS** — unit test |
| Scroll to date on error | **PASS (code)** — `paymentDate` first in `COMPOSER_FIELD_ORDER` |
| PDF dates | **PASS (code)** — PDF row "Cash paid date"; recorded-on via profile/history blocks |

#### 6. Professional Pack

| Check | Result |
|-------|--------|
| CA/Tax matter (e.g. GST return) | **PASS (code)** — `matterSummary` required; `validatePackForm` |
| CS/Compliance matter | **PASS (code)** — same pattern |
| Legal matter | **PASS (code)** — same pattern |
| Blank save blocked | **PASS (code)** — Zod `min(1)` on required fields + summary |
| Draft save | **PARTIAL** — `clearPackDraft` / pack drafts service — **device retest** |
| No advice/filing claims | **PASS (code)** — disclaimers in PDF templates / statutory copy |

#### 7. Regression

| Area | Result |
|------|--------|
| Typecheck / lint | **PASS** |
| Record open / PDF / search / calendar | **Not broken in diff** — no logic changes in those modules this pass |
| You dashboard layout | **Unchanged** in stabilisation pass (prior spacing work separate) |

#### Flows still risky (device required)

1. **Letterhead** — very large template image (>700 KB) or long body clipping  
2. **Pro pack** — draft save/resume per category  
3. **Picker sheet** — Reanimated warnings in Expo Go (observed in logs); watch for gesture glitches  
4. **Android** — letterhead PDF WebView may differ — test one export  

#### Overall verdict

| Question | Answer |
|----------|--------|
| Letterhead PDF reliable iOS/Android? | **Likely yes** for standard data-URI templates; **device visual confirm** required; overflow still single-page |
| Back navigation consistent? | **Yes in code** for all + picker paths after B1/B2 fix; **Staff → expanded Work & Team** needs one device check |
| Drafts production-usable? | **Yes for composer**; **partial** for letterhead/pro-pack until you verify save/resume on device |

### Risky areas to test first tomorrow

1. Composer save with **reminder + notifications denied**
2. **PDF export/share cancel** on entry detail and letterhead history
3. **Profile logo** missing file on disk → PDF still generates
4. **Returning user** with incomplete `profileCompletedAt` deep-linked into `(app)`

---

## Smart Master Data & Field Suggestions (2026-05-31)

App-wide, **user-private** form intelligence: remembers values the signed-in user has saved before and suggests them in matching fields. Not a new screen; not global search; not shared across users or UEIDs.

### Files changed / added

| Path | Role |
|------|------|
| `src/localDb/schema.ts`, `migrate.ts`, `init.ts` | DB v5 — `master_data_suggestions` table + indexes |
| `src/services/masterData/types.ts` | `MasterDataSuggestion`, `MasterFieldKey`, scope types |
| `src/services/masterData/fieldKeys.ts` | Form field → `fieldKey` map, query-key groups, ingest blocklist, pro-pack map |
| `src/services/masterData/normalize.ts` | Normalize, junk filter, mobile mask for display |
| `src/services/masterData/masterDataRepository.ts` | SQLite CRUD — **every query filters `user_id`** |
| `src/services/masterData/masterDataIngest.ts` | Extract on save from composer / letterhead / pro pack |
| `src/services/masterData/index.ts` | Public exports |
| `src/hooks/useFieldSuggestions.ts` | Debounced query (180ms), top 5, no user → no suggestions |
| `src/components/forms/SmartSuggestionInput.tsx` | Premium compact dropdown under field |
| `src/components/composer/ComposerSmartTextField.tsx` | Composer wrapper resolving `fieldKey` from name |
| `src/components/composer/BusinessComposerForm.tsx` | Smart fields for mapped composer inputs |
| `src/components/composer/PaymentRequestFields.tsx` | Party, invoice, bank holder/name/UPI (not account #) |
| `src/components/composer/OutwardFreightFields.tsx` | Bill/LR/transporter/vehicle/contacts |
| `src/components/professionalPack/ProfessionalPackForm.tsx` | Mapped matter + professional name/contact |
| `app/(app)/composer/[type].tsx` | Ingest on final save + explicit Save draft |
| `app/(app)/letterhead/create.tsx` | Smart subject/name/designation/place + ingest |
| `app/(app)/professional-pack/form.tsx` | Ingest on pack save |
| `src/services/accountDeletion/purgeLocal.ts` | Delete master data for user |
| `src/state/auth.tsx` | `clearMasterDataSessionCache` on sign-out; on OTP user switch |
| `src/i18n/locales/en.ts`, `hi.ts` | `masterData.*` strings |
| `src/components/ui/TextField.tsx` | Export `TextFieldProps` |

### Model

`MasterDataSuggestion`: `id`, `userId`, `ueid`, `fieldKey`, `value`, `normalizedValue`, `displayValue`, `category`, `sourceRecordType`, `sourceField`, `usageCount`, `lastUsedAt`, `createdAt`, `updatedAt`, `hiddenAt`, optional `metadata`.

Unique index: `(user_id, field_key, normalized_value)`.

### Fields integrated (stable `fieldKey`s)

- **Payment Request:** `partyName`, `invoiceNumber`, `personName` (contact), `bankName`, `accountHolderName`, `upiId` — not amounts, dates, `requestNote`, account number, IFSC.
- **Cash Paid:** `givenToName` — not `purpose` (multiline), amount, dates.
- **Freight:** `billNumber`, `lrGrNumber`, `dispatchLocation`, `deliveryLocation`, `transporterName`, `vehicleNumber`, `clarificationContactName`, `clarificationContactMobile` — not remarks/notes/dates.
- **Material Dispatch / Receipt:** party/supplier, material, invoice/challan, LR, transporter, vehicle, locations (incl. postal display labels on save).
- **Staff Note:** `staffName` only — not `matterDetails`, not matter type dropdown.
- **Work Update:** `sitePlace` — not long work/issue text.
- **Reminders:** `itemMaterial`, `purposeSubject` (short) — not reminder dates.
- **Letterhead:** `personName` (name/designation), `deliveryLocation` (place), `partyName` (subject) — not body/closing.
- **Professional Pack:** mapped text fields (party, entity, GSTIN, etc.) + professional name/contact — not multiline legal narratives, amounts, dates.

### Extraction rules

- **Final record save** (composer, letterhead doc created, pro pack save): `ingestComposerForm` / `ingestLetterheadForm` / `ingestProfessionalPackForm`.
- **Explicit Save draft** (composer only): same ingest when user taps Save draft (meaningful payload only per existing draft rules).
- **Not** from recovery autosave or discarded drafts.
- Skip blocklisted keys (amounts, dates, long notes, bank account number, etc.).
- Junk filter: empty, 1-char, placeholders (`test`, `na`, …) unless same normalized value already has `usageCount >= 2`.
- Postal: ingest resolved display label into location keys on save.

### Ranking / deduping

- Query scoped to `user_id` + related `field_key`s via `queryKeysForFieldKey`.
- Prefix match on `normalized_value` (case/space rules per field type).
- Order: exact normalized match → prefix → `usage_count` DESC → `last_used_at` DESC.
- Duplicate casing merges via unique `(user_id, field_key, normalized_value)`.

### Remove from list

- Trash icon on row → `hidden_at` set for that row **for that user only**; historical diary records unchanged.
- Re-appears only if user saves the value again (upsert clears `hidden_at`).

### Privacy safeguards (P0)

- All rows include `userId` + `ueid`; repository rejects missing scope; no suggestions without signed-in user.
- `sessionUserId` gate + `clearMasterDataSessionCache()` on sign-out; cleared when OTP signs in as different `uid`.
- Delete account: `DELETE FROM master_data_suggestions WHERE user_id = ?` + session cache clear.
- No production logging of suggestion values (repository does not log values).
- Mobile masked in dropdown (`••••• 1234` style).
- Not in global search index; not in statutory tables.
- No cross-user pooling or “popular values.”

### Draft integration

- Suggestion dropdowns work while editing/resuming drafts.
- Selecting a suggestion updates form state (saved with draft/save as today).
- Master data updated only on **explicit draft save** or **final save**, not on recovery autosave.

### Performance

- Dedicated SQLite table/index; debounced queries; no full-record scans per keystroke.
- Dropdown shows top 3–5 only; hidden when no matches.

### Manual tests

1. **Payment Request** — save with party + invoice; new form → type party prefix → suggestion; Remove from list → gone; other user on device → no leak.
2. **Cash Paid** — given-to name suggests on second entry.
3. **Freight** — transporter / LR / vehicle suggest in freight form only.
4. **Material Receipt/Dispatch** — supplier/material/vehicle/location.
5. **Staff Note** — staff name only.
6. **Letterhead** — name/place/subject suggest; body does not.
7. Logout as A, login as B → A’s values never appear.
8. Delete account → master data gone for that user.

---

## Keyboard-safe form layout (2026-05-31) — P0 UX

### Root cause

- Most entry screens used `<Screen scroll>` **without** keyboard avoidance; only the composer had `keyboardAvoiding`.
- Android had no `softwareKeyboardLayoutMode: resize`, so the window did not shrink for the keyboard.
- No extra scroll padding when the keyboard was open — bottom fields and Save sat under the keyboard.
- iOS did not use `automaticallyAdjustKeyboardInsets` on `ScrollView`.
- `scrollToField` on validation used a fixed offset and ignored keyboard height; inputs did not scroll on focus.
- `KeyboardAvoidingView` wrapped only the scroll area, not the footer (identity Save bar).

### Shared system

| Piece | Path | Role |
|-------|------|------|
| Form screen mode | `src/components/ui/Screen.tsx` — prop **`form`** | KAV (`padding` iOS + Android), keyboard height padding, `keyboardShouldPersistTaps="handled"`, iOS `automaticallyAdjustKeyboardInsets`, internal `scrollRef` if omitted |
| Scroll context | `src/components/forms/KeyboardFormScrollContext.tsx` | `contentRef` + `scrollToAnchor` for focus |
| Field wrapper | `src/components/forms/KeyboardAwareField.tsx` | Scroll anchored field into view on focus |
| Composer anchors | `src/hooks/useKeyboardAwareFieldScroll.ts` | Validation scroll + `fieldBindings.wrap` focus chain |
| Scroll math | `src/utils/keyboard/scrollFieldIntoView.ts` | measureLayout + keyboard overlap + one delayed re-pass |
| Inset hook | `src/hooks/useKeyboardInset.ts` | Keyboard show/hide height |

Use: `<Screen scroll form scrollRef={ref}>` (optional `footer`, `tabBarInset`).

### Screens migrated to `form`

- `app/(app)/composer/[type].tsx`
- `app/(app)/professional-pack/form.tsx` (+ `ProfessionalPackForm` `KeyboardAwareField`)
- `app/(app)/letterhead/create.tsx`
- `app/(app)/settings/identity.tsx`
- `app/(auth)/complete-profile.tsx`
- `app/(auth)/change-mobile.tsx`
- `app/(app)/diary/edit/[id].tsx` (legacy edit)

### Android config

`app.json` → `"softwareKeyboardLayoutMode": "resize"` (Expo adjustResize). Rebuild native binary for this to apply in dev client/production.

### iOS

- Safe-area top used as `keyboardVerticalOffset` on `KeyboardAvoidingView`.
- Tab screens: use `tabBarInset` on tab-root screens only; composer/letterhead are stack screens (no tab overlap).
- Footer pinned inside same `KeyboardAvoidingView` as scroll (identity).

### Validation scroll

`BusinessComposerForm` → `useKeyboardAwareFieldScroll` + existing `firstComposerFieldError` → `scrollToField` with keyboard-aware overlap.

### Manual QA (device)

| Flow | Check |
|------|--------|
| Payment Request | Bank panel open → account holder / IFSC visible while typing |
| Freight | PIN, LR, transporter, contact fields |
| Cash Paid | amount, given-to, purpose |
| Staff Note | staff name, matter details |
| Material Dispatch/Receipt | lower fields + locations |
| Letterhead | long body field |
| Professional Pack | matter summary / facts |
| Identity | display / business name with footer Save |

**Code review:** PASS typecheck. **Device:** required especially Android after `softwareKeyboardLayoutMode` rebuild.

### P0 Input Safety & Keyboard Experience System (2026-06-04)

App-wide keyboard-safe primitives under `src/components/inputSafety/`. Business logic, schemas, PDFs, auth identity, and draft persistence were **not** changed.

#### Agreement Drafting root cause

1. **Primary:** `scrollFieldIntoView` animated scroll on focus **before** keyboard height was known → layout jump on first field (Summary of the matter) → TextInput blur → keyboard failed to stay open.
2. **Secondary:** `TextField` used a parent **`Pressable`** around `TextInput` — on multiline rows, taps could miss the input and focus was unreliable.
3. **Tertiary:** Stacked KAV + dynamic padding + iOS `automaticallyAdjustKeyboardInsets` caused layout thrash; suggestion dropdown roots lacked `pointerEvents="box-none"`.

#### Shared components (`src/components/inputSafety/`)

| Component | Role |
|-----------|------|
| **`KeyboardSafeScreen`** | Alias for `<Screen scroll form>` — single scroll owner, KAV, keyboard padding, validation provider |
| **`KeyboardSafeBottomSheet`** | Modal/bottom sheet with KAV, scroll body, keyboard-aware footer |
| **`SmartTextField`** | TextField + optional master-data suggestions + `KeyboardAwareField` shell |
| **`SmartDropdown`** | Re-export of `SelectField` — modal list, never behind keyboard |
| **`FormActionBar`** | Compact Save/Draft/PDF footer with Android keyboard inset |
| **`ValidationFocusManager`** | `ValidationFocusProvider` + `useValidationFocus` — scroll/focus first invalid field |

Supporting pieces (unchanged paths, updated behaviour):

- `src/components/ui/Screen.tsx` — nests `ValidationFocusProvider`; `keyboardShouldPersistTaps="always"` on form screens
- `src/components/forms/KeyboardAwareField.tsx` — keyboard-gated scroll; validation anchor + ref merge
- `src/utils/keyboard/scrollFieldIntoView.ts` — no focus scroll until keyboard known; `reveal: true` for validation
- `src/components/ui/TextField.tsx` — **removed Pressable wrapper**; full-width TextInput tap target
- `src/components/forms/SmartSuggestionInput.tsx` — `forwardRef`; `pointerEvents="box-none"` root

#### Auth v2

- `AuthShell` — scroll ref, `KeyboardFormScrollProvider`, `ValidationFocusProvider`, `keyboardShouldPersistTaps="always"`, iOS auto insets, Android footer keyboard padding
- Phone / OTP / Email — `KeyboardAwareField` on inputs
- Business Identity — `OnboardingV2TextField` + `fieldId`; validation scroll on submit

#### Screens migrated / updated

| Phase | Screens |
|-------|---------|
| 1 Pro Pack | `ProfessionalPackForm` → `SmartTextField`, `FormActionBar`, validation focus on save |
| 2 Auth | `AuthShell`, `PhoneEntryScreen`, `OtpVerificationScreen`, `EmailEntryScreen`, `BusinessIdentityScreen` |
| 3 Core forms | Already on `<Screen form>`: composer, PO, customer credit, letterhead create, identity |
| 4 Remaining | `letterhead/setup.tsx` → `form`; profile edit → `SmartTextField` |
| 5 Sheets/search | `SelectField` → KAV in modal; global search uses dedicated header input (no form scroll needed) |

#### Validation focus

- Composer: `useKeyboardAwareFieldScroll` + `firstComposerFieldError` (unchanged)
- Professional Pack: `useValidationFocus().scrollToFirstInvalid` on react-hook-form invalid
- Business Identity onboarding: same pattern with `FIELD_ORDER`

#### Manual QA matrix (device required)

| Area | Check |
|------|--------|
| Agreement Drafting | Summary → keyboard opens → type 3 lines → save draft → resume |
| Auth | phone, OTP, email, name, business, field of work, designation |
| Composer | Payment Request, Cash Paid, Freight, Dispatch, Receipt, Staff, Work Update, Reminders |
| PO / Credit / Letterhead | lower fields + multiline + PIN/GSTIN |
| Identity edit | footer Save reachable; validation scroll |
| iOS | No flicker on first focus; CTA visible |
| Android | `softwareKeyboardLayoutMode: resize` in dev client; bottom fields + Save above keyboard |

#### Tests

- `npm run test:keyboard-focus`
- `npm run typecheck` / `npm run lint`

#### Risky / monitor

- Bottom sheets with custom gesture handlers (composer picker — no inputs; OK)
- `diary/[id].tsx` read-only detail — not a form screen
- Device QA not run in CI — **verify on iPhone + Android**

#### Business logic confirmation

No changes to record schemas, PDF generation, statutory logic, Saved Records, Calendar & Maps, auth identity bonding, UEID/email/mobile policy, or repositories.

### Return Key / Next Field Navigation (2026-06-04)

Continuation of Input Safety — keyboard **Next/Done** moves focus through single-line fields; multiline fields keep Enter for new lines.

#### Architecture

| Piece | Path | Role |
|-------|------|------|
| **`FormFocusProvider`** | `src/components/inputSafety/FormFocusManager.tsx` | Context: register fields, ordered `focusNext`, `getNavigationProps` |
| **`useFormFieldNavigation(order)`** | same | Sets field order per screen; returns `bind()` helper |
| **`navFieldKey` on `TextField`** | `src/components/ui/TextField.tsx` | Auto-registers + applies return-key props |
| **Field orders** | `src/utils/formFieldNavigation/fieldNavOrders.ts` | Per-form orders + `buildPurchaseOrderNavOrder` / `buildCustomerCreditNavOrder` |
| **`MULTILINE_FIELD_KEYS`** | same | Enter must not advance (body, remarks, purpose, agreement summary, etc.) |
| **Validation focus** | `ValidationFocusManager` | Uses `formFocus.focusField` after scroll-to-invalid |

Wired on `<Screen form>` via `FormFocusProvider` nested in `Screen.tsx`. Auth/onboarding via `FormFocusProvider` in `AuthShell`.

#### Field-type rules

- **Single-line** (`navFieldKey` + not `multiline`): `returnKeyType="next"` until last field, then `"done"`; `blurOnSubmit={false}`; `onSubmitEditing` → next field.
- **Multiline** (`multiline={true}` or key in `MULTILINE_FIELD_KEYS`): `blurOnSubmit={false}`; no next-field jump on Enter.
- **Numeric keypads** (phone-pad, number-pad, decimal-pad): next-field on Android where `onSubmitEditing` fires; **iOS often has no Next key** — user taps next field; keyboard-safe scroll unchanged.

#### Forms migrated

Auth v2 (phone Done → continue when valid; OTP Done → verify when complete; email Done → continue; Business Identity text chain), composer (`BusinessComposerForm` + `PostalLocationSection` + `ComposerSmartTextField`), Professional Pack, profile edit panel, Purchase Order (dynamic item keys), Customer Credit / EMI (dynamic products + conditional payment fields), Letterhead create.

#### Manual QA (device)

| Check | Expected |
|-------|----------|
| Business Identity | Name → Business → Field of Work → Done on last text field |
| Agreement Drafting summary | Enter inserts newline; short fields advance on Next |
| PO item row | Name → desc lines → qty → rate |
| Letterhead body | Multiline paragraphs; reference → recipient → subject chain on Next |
| Validation save | Scroll + focus first invalid; no spurious next-field during validation |

#### Business logic confirmation

Same as Input Safety pass — schemas, PDFs, repositories, auth bonding, drafts untouched.

### P0 input focus / keyboard glitch fix (2026-06-03)

#### Root cause

1. **Primary:** `scrollFieldIntoView` ran an **animated scroll on every input focus while `keyboardHeight === 0`**, scrolling to `layoutY - 88` before the keyboard opened. On Professional Pack (Agreement Drafting **Summary of the matter** is the first field), this caused a visible jump/flicker and often **blurred the TextInput** so the keyboard never stayed open.
2. **Secondary:** Form `Screen` stacked **KeyboardAvoidingView padding + dynamic keyboard bottom padding + iOS `automaticallyAdjustKeyboardInsets`** — layout thrash on focus.
3. **Tertiary:** Multiline `TextField` row padding left dead zones where taps did not hit the `TextInput`; suggestion dropdown roots did not use `pointerEvents="box-none"`.

#### Shared fixes

| File | Change |
|------|--------|
| `src/utils/keyboard/scrollFieldIntoView.ts` | No scroll on focus until keyboard height known; `reveal: true` for validation-only scroll |
| `src/utils/keyboard/scrollFieldFocusPolicy.ts` | Pure focus-scroll policy (unit tested) |
| `src/components/forms/KeyboardAwareField.tsx` | Scroll after `keyboardWillShow` / `keyboardDidShow`, not on raw focus |
| `src/hooks/useKeyboardAwareFieldScroll.ts` | Same keyboard-gated focus scroll; validation uses `reveal: true` |
| `src/components/forms/KeyboardFormScrollContext.tsx` | `pointerEvents="box-none"` on content anchor |
| `src/components/ui/Screen.tsx` | iOS: `automaticallyAdjustKeyboardInsets` only (no KAV, no dynamic keyboard padding); Android: KAV + keyboard padding; `keyboardShouldPersistTaps="always"` on form screens; no `removeClippedSubviews` on form screens |
| `src/components/ui/TextField.tsx` | Full-row tap target (`Pressable` + stretched input); multiline stretch |
| `src/components/forms/SmartSuggestionInput.tsx` | `pointerEvents="box-none"` root; dropdown `auto` only when open |

#### Regression test

`npm run test:keyboard-focus` → `src/utils/keyboard/scrollFieldIntoView.test.ts`

#### Manual QA (device)

| Flow | Check |
|------|--------|
| Agreement Drafting | Summary of matter → keyboard opens → type 3 lines → save draft → resume |
| Agreement Drafting | Tap every text field sequentially |
| CA/Tax + CS/Compliance packs | Same field tap check |
| Composer | Payment Request, Freight, Staff Note, Cash Paid, Dispatch, Receipt |
| Letterhead | Body/matter multiline |
| Identity | Name / business / designation edit panel |

**No business logic, schema, PDF, or draft persistence changes.**

### Risky / not migrated

---

## Location footprints — global consent (2026-05-31)

### Removed (per-form GPS block)

Generic **“GPS location (optional)”** UI removed from all composer record forms via `BusinessComposerForm` (deleted `ComposerGpsLocationField.tsx`) and legacy `EntryForm` GPS section. **Kept:** manual business fields (party/site, delivery/dispatch, PIN/postal sections, destination, received-at, etc.).

### Consent flow

- `LocationFootprintConsentHost` on main tabs after `profileCompletedAt` — one-time sheet (`locationFootprints.consent.*`).
- **Not now:** `locationFootprintsEnabled: false`, consent timestamps saved; app continues normally.
- **Allow:** in-app explanation first, then native foreground permission; `locationFootprintsEnabled: true`.
- No permission request before explanation; no background/continuous collection.

### When GPS is captured

- `resolveEntryLocationWithFootprint(userId, manualLocation)` on **composer save** (create + update) and **letterhead** diary link create; legacy **diary edit** save.
- Foreground only, app preference on, OS permission `granted`.
- Save **never fails** if GPS fails; optional warning `locationFootprints.saveAttachFailed`.

### Denied / revoked permission

- `syncLocationFootprintPermissionStatus` on app focus and settings open.
- Capture skipped silently; manual/PIN map markers unchanged.
- Calendar map banner: `locationFootprints.map.accessOff` (links to Settings — does not request permission on map open).

### Settings

- **Settings → Location footprints** (`app/(app)/settings/location-footprints.tsx`): OS status, enable toggle, privacy copy, phone settings link.

### Calendar & Maps markers

- **GPS** (`mapFootprintSource: gps`) — device footprint on save when enabled.
- **PIN approximate** (`pin_approximate`) — postal centroids from freight/dispatch PIN; never fake GPS.
- Map legend: `calendarMaps.map.legendFootnote` (EN/HI).
- `showsUserLocation={false}` (no live blue-dot tracking).

### Privacy

- Prefs per user in AsyncStorage `vyd_location_footprints_v1_{userId}`; cleared on account delete.
- No raw GPS in production logs (existing logger policy).
- `app.json` / Expo location strings updated for purpose-limited foreground use.

### Files (main)

`src/domain/locationFootprintPreferences.ts`, `src/services/location/locationFootprintPreferences.ts`, `src/services/location/locationFootprintCapture.ts`, `src/components/location/*`, `src/services/location/locationRecordService.ts` (manual-only merge), `app/(app)/composer/[type].tsx`, `BusinessComposerForm.tsx`, `CalendarMapsMapPanel.tsx`, `EntryForm.tsx`, `settings/location-footprints.tsx`, i18n `locationFootprints.*`.

### Manual tests

1. Complete profile → one-time consent → Not now → forms have no GPS block; saves work.
2. Settings → enable footprints → grant OS → save Payment Request → map shows GPS pin.
3. Revoke OS permission → new saves without GPS; map banner + existing pins remain.
4. Freight with From/To PIN only → approximate ring markers, distinct from GPS.
5. Save with GPS failing (airplane mode) → record still saves + subtle warning.

### Risky / not migrated

- `you.tsx` dashboard scroll (not a single long form).
- Map / calendar full-screen panels (intentionally unchanged).
- `letterhead/setup.tsx` (mostly image picker).
- Modal sheets (`DraftUnsavedSheet`, picker) — separate from main scroll owner.

---

## First-time onboarding flow (refined 2026-06-02)

### Old flow (before this pass)
- Mobile login used a checkbox with “Vyaamikk ID tied to your mobile…” consent copy.
- Onboarding showed **Step 1 / 2 / 3 of 3** though only step 1 collected data.
- Profile step collected salutation, email, and six fields; UEID could appear early in older builds.
- Location onboarding required a mandatory Allow/decline choice and marked consent on screen mount.
- No Settings change-count policy for business name / email.

### New flow
**New user:** mobile (`Verify mobile` stage) → OTP → **Build your business identity** (4 fields only) → save → **Vyaamikk ID ready** (UEID shown only after save; `ueidReleasedAt` set on Continue) → **intro / benefit splash** once (`onboardingIntroSeenAt`) → **Location footprints** (optional Allow / Not now; OS prompt only on Allow) → You dashboard (or draft continuation).

**Returning completed user:** mobile → OTP → dashboard / last meaningful local state (no UEID release, intro, or location replay).

**Returning incomplete user:** mobile → OTP → resume correct stage via `resolveAuthOnboardingRoute.ts`.

**Mid-flow app close:** next open resumes the same stage; incomplete users are not routed to You dashboard.

### Named stages (no “Step X of 3”)
| Stage label (EN) | Screen | Collects data? |
|------------------|--------|----------------|
| Verify mobile | `login.tsx`, `otp.tsx` | mobile / OTP only |
| Build your business identity | `complete-profile.tsx` | **only** onboarding data entry |
| Vyaamikk ID ready | `ueid.tsx` | release / view UEID |
| Location footprints | `location-onboarding.tsx` | optional consent |

i18n: `onboarding.stages.*` (EN + HI).

### Mobile login copy
- Removed UEID-tied checkbox consent.
- Near **Send OTP**: “By continuing, you agree to the Terms of Use and Privacy Policy” with tappable links (`LegalConsentFooter` + `openSafeExternalUrl`).

### Profile fields (onboarding only — all required for new registrations)
| UI label | Stored field | Notes |
|----------|--------------|-------|
| Title (salutation) | `salutation` | executive picker; no “None” |
| Your name | `displayName` | required |
| Business / profession name | `businessName` | required |
| Field of work | `workType` | required |
| Business / professional email | `businessEmail` | required; domain suggestions after `@` |
| Designation | `designation` | preset + Other |
| — | `profileCompletedAt` | set on Save & continue |

Logo and further edits remain in **Settings → Business Identity** (change limits apply after onboarding).

### UEID release timing
- UEID minted at OTP in backend (unchanged); **not shown** until `profileCompletedAt` is set.
- `updateProfile({ ueidReleasedAt })` on UEID screen Continue only — never regenerated on back/forward or profile edits.
- `ueidReleasedAt` doubles as “has seen UEID release” for returning-user skip (no separate `hasSeenUeidRelease` field).

### Back / read-only after UEID release
- Back from UEID → `complete-profile` in **read-only** mode when `ueidReleasedAt` is set (greyed fields + `onboarding.profile.lockedAfterUeid`).
- User can view entered values; cannot edit identity during onboarding after release.

### Profile update policy (Settings)
Implemented in `src/domain/profileUpdatePolicy.ts` + `src/utils/profile/applyProfileUpdatePolicy.ts`, applied on **Settings → Business Identity** save (`source: "settings"`).

| Field | Policy |
|-------|--------|
| Your name | editable; changes tracked in `profileChangeHistory` |
| Business / profession name | max **2** changes after onboarding (`businessNameChangeCount`) |
| Business email | max **2** changes (`emailChangeCount`); verification not implemented this pass |
| Field of work / designation | editable; tracked in history; **limit not enforced** — see `profilePolicy.fieldOfWorkRecommendation` in HANDOVER only |
| Mobile | existing OTP `change-mobile` flow only; same UEID |

Limit message: `profilePolicy.limitReached`.

### Fields added / mapped
| Field | Purpose |
|-------|---------|
| `businessNameChangeCount` | Settings edits to business name |
| `emailChangeCount` | Settings edits to email |
| `profileChangeHistory[]` | `{ at, field, oldSummary, newSummary, source }` — support audit, not shown in UI |
| `lastProfileEditedAt` | last policy-tracked edit |
| `ueidReleasedAt` | UEID release + skip replay |
| `onboardingIntroSeenAt` | intro splash once per user |

`profileUpdateLockedFields[]` not stored; limits derived from counts at runtime.

### Routing (`src/boot/resolveAuthOnboardingRoute.ts`)
1. `!profileCompletedAt` → `/(auth)/complete-profile`
2. `!ueidReleasedAt` → `/(auth)/ueid`
3. `!onboardingIntroSeenAt` → `/(auth)/onboarding-intro`
4. `locationConsentShownAt == null` → `/(auth)/location-onboarding`
5. Else dashboard / draft

Boot does **not** show `VyaamikkIntroSplash` globally.

### Location
- Optional; **Not now** skips footprints and still enters app.
- `locationConsentShownAt` set only when user taps Allow or Not now (not on mount).
- Allow → then `locationService.requestPermission()`.

### Intro / splash once-only
- `app/(auth)/onboarding-intro.tsx` after UEID release; `onboardingIntroSeenAt` + per-user `markIntroSplashSeen`.
- Returning users with flag set skip intro.

### Manual test matrix (2026-06-02)
| Scenario | Expected |
|----------|----------|
| New user full path | mobile → OTP → 4-field profile → UEID → intro (once) → location (optional) → dashboard |
| Returning completed | OTP → dashboard; no step labels / UEID / location / intro replay |
| Incomplete mid-onboarding | OTP → resume correct auth route |
| Back after UEID release | profile screen read-only + lock message |
| Business name 3rd edit in Settings | save blocked with limit message |
| Location Not now | dashboard without OS prompt; no repeat prompt |
| Typecheck / lint | `npx tsc --noEmit` passes |

### UEID (unchanged rules)
Created at OTP; not shown until profile saved. No duplicate UEID; identity lifecycle rules in “Mobile → UEID identity lifecycle” section above.

---

## Auth wrapper v2 (premium phone → OTP → email) — 2026-06-02

### Feature flag (mandatory rollback)
- `EXPO_PUBLIC_AUTH_WRAPPER_V2=1` → new flow at `/(auth)/v2`
- Unset, `0`, or `false` → legacy `/(auth)/login` + `/(auth)/otp` (no regression)

### Existing auth stack (reused)
| Layer | Path | Role |
|-------|------|------|
| Provider | `src/state/auth.tsx` | `startOtp`, `confirmOtp`, `updateProfile`, `signOut`, SecureStore session |
| Service | `src/services/auth/index.ts` | `getAuthService()` → mock / firebase-production / firebase-shared-dev |
| OTP | `startOtp` / `confirmOtp` on `AuthService` | 6-digit OTP; dev hint `123456` in non-production Firebase-shared and local-mock |
| Boot | `src/boot/resolveBootRoute.ts` | Signed-out → `getAuthEntryHref()`; signed-in → onboarding gates unchanged |
| Session | `src/services/session.ts` | SecureStore persistence (unchanged) |

No new Firebase Phone Auth dependency. Production SMS is still only as mature as the active `AuthService` backend.

### New module (`src/auth-v2/`)
| File | Purpose |
|------|---------|
| `AuthFlowGate.tsx` | State machine: phone → confirm → otp → email → `router.replace("/")` |
| `screens/PhoneEntryScreen.tsx` | +91 + local number, Terms/Privacy, confirm card |
| `screens/OtpVerificationScreen.tsx` | 6-digit OTP, resend cooldown, `textContentType=oneTimeCode` |
| `screens/EmailEntryScreen.tsx` | Email capture → `updateProfile({ businessEmail })` |
| `components/AuthShell.tsx` | Indigo gradient, keyboard-safe shell |
| `authWrapperProgress.ts` | Challenge snapshot + email-pending flag (AsyncStorage) |
| `config/authWrapper.ts` | Flag + `getAuthEntryHref()` + `needsAuthWrapperEmailCompletion()` |

Route: `app/(auth)/v2.tsx` → `AuthFlowGate`.

### Flow (flag ON)
1. Phone (+ confirm card) → `startOtp` / `sendOtpForWrapper`
2. OTP → `confirmOtp` (existing session + UEID rules unchanged)
3. Email → `updateProfile`; skip if `businessEmail` already set
4. `router.replace("/")` → existing `resolveBootDestination` (profile / UEID / intro / location / dashboard)

### Email storage
- Field: `UserProfile.businessEmail` via existing `updateProfile`
- Pending flag: `vyd_auth_v2_email_pending_{uid}` until email saved (resume after app kill mid-email)
- Does not claim email is verified (copy in `authV2.email.footnote`)

### OTP autofill / SMS retriever
- iOS/Android: `autoComplete="one-time-code"`, `textContentType="oneTimeCode"`, `importantForAutofill="yes"` on OTP field
- No extra native SMS Retriever package in this pass; manual entry required if autofill unavailable

### Rollback
1. Remove or set `EXPO_PUBLIC_AUTH_WRAPPER_V2=0` in env
2. Rebuild / restart Metro
3. App uses `/(auth)/login` again

### One login page (company direction)
- **Testing now:** set `EXPO_PUBLIC_AUTH_WRAPPER_V2=1` in local `.env` (see `.env.example`). Restart with `npx expo start --clear`. Only `/(auth)/v2` is shown; legacy `login`/`otp` redirect to v2 when the flag is on.
- **After product sign-off:** remove legacy `login.tsx` / `otp.tsx` and make v2 the sole sign-in route; keep the env flag only if you still want an emergency rollback build.

### Manual tests (auth v2)
| Test | Flag | Expected |
|------|------|----------|
| New user | ON | phone → confirm → OTP → email → complete-profile / UEID chain |
| Returning user (has email) | ON | OTP → skip email → existing boot route |
| Invalid OTP | ON | Inline error, stay on OTP |
| Resend OTP | ON | Cooldown 30s, new verificationId |
| Invalid email | ON | Continue disabled |
| App restart mid-OTP | ON | Resume OTP if challenge snapshot exists |
| App restart mid-email | ON | Resume email if signed in + pending flag |
| Legacy login | OFF | `login.tsx` + `otp.tsx` unchanged |
| Logout | either | Clears wrapper AsyncStorage for uid |

---

## Auth v2 onboarding shell consistency — 2026-06-02

### Goal
With `EXPO_PUBLIC_AUTH_WRAPPER_V2=1`, the full first-time path uses the same premium indigo onboarding surface from phone through location consent. Post-dashboard UI, business modules, schemas, and sync/auth internals are unchanged.

### Shared shell / components
| Piece | Path | Role |
|-------|------|------|
| Gradient shell | `src/auth-v2/components/AuthShell.tsx` | Indigo gradient, back button, keyboard-safe scroll |
| Onboarding wrapper | `src/auth-v2/components/OnboardingV2Shell.tsx` | `AuthShell` + stage label + `LanguageToggle` (`onDark`) |
| Inputs | `src/auth-v2/components/OnboardingV2TextField.tsx` | Rounded light-on-gradient fields |
| CTAs | `AuthV2PrimaryButton`, `AuthV2SecondaryButton` | Primary / outline actions |
| Theme hook | `src/auth-v2/hooks/useAuthV2Theme.ts` | `authV2Tokens` for onboarding screens |

### Screens visually replaced (flag ON only)
| Route | Legacy UI | v2 UI |
|-------|-----------|-------|
| `/(auth)/complete-profile` | `Screen` + `OnboardingStepShell` (light) | `BusinessIdentityScreen` — 4 fields, no email |
| `/(auth)/ueid` | Light step shell | `UeidReleaseOnboardingScreen` |
| `/(auth)/location-onboarding` | Light panel | `LocationFootprintOnboardingScreen` |

Legacy paths unchanged when flag is OFF.

### First-time flow (flag ON)
`/(auth)/v2` phone → confirm → OTP → email → boot → **business identity** (4 fields) → **UEID release** → **intro splash** (once) → **Business Footprint** → dashboard (`/(app)/(tabs)/you`).

Copy: identity title **Build your business identity**; subtitle **Tell us how your records should identify you.** No “Step 1 of 3.” Location title **Business Footprint**; OS permission only after **Allow location footprints**.

### Returning-user flow (flag ON)
- Boot `resolveBootDestination` unchanged: resume incomplete stage only.
- Complete profile + UEID + intro + location skipped when already satisfied.
- Email not re-asked if `businessEmail` set in v2 (`onboardingProfileCoreSchema` has no email field).
- `AuthFlowGate`: signed-in users with `profileCompletedAt` hand off to `/`; incomplete profile can reopen email via `/(auth)/v2?step=email&from=profile` (back from identity).

### Duplicate email
Captured in `EmailEntryScreen` → `updateProfile({ businessEmail })`. `BusinessIdentityScreen` does not render or validate email; patch keeps existing `businessEmail` from auth.

### UEID release timing
Unchanged: UEID exists after OTP but **UEID screen** only after `profileCompletedAt` is set on identity save. No regeneration; returning users with `ueidReleasedAt` skip release via boot resolver.

### Location prompt timing
After intro splash (if not seen). `markLocationFootprintConsentShown` on Allow and Not now; native `requestPermission()` only on Allow. Deny / Not now → dashboard normally.

### Back behaviour
| Step | Back |
|------|------|
| OTP | Change number (sign-out + phone) |
| Email (from profile) | `complete-profile` |
| Business identity | v2 email when email already saved; else v2 |
| After UEID | Identity read-only + lock banner; edits later in Settings per policy |
| UEID → identity | Read-only values; no duplicate UEID or profile reset |

### Files changed (this pass)
`src/auth-v2/components/*` (shell, fields, buttons), `src/auth-v2/screens/BusinessIdentityScreen.tsx`, `UeidReleaseOnboardingScreen.tsx`, `LocationFootprintOnboardingScreen.tsx`, `src/auth-v2/AuthFlowGate.tsx`, `src/auth-v2/components/AuthShell.tsx`, `app/(auth)/complete-profile.tsx`, `ueid.tsx`, `location-onboarding.tsx`, `src/utils/validation.ts` (`onboardingProfileCoreSchema`), `src/components/profile/DesignationPicker.tsx` (`appearance="authV2"`), `src/components/ui/LanguageToggle.tsx` (`onDark`), `src/i18n/locales/en.ts`, `hi.ts`, `HANDOVER.md`.

### Confirmation
Dashboard tabs, record/PDF/draft/statutory/calendar logic, and auth service implementations were not modified in this pass.

---

## Settings — unified Profile & Business Identity — 2026-06-02

### Settings rows removed / merged
| Before | After |
|--------|--------|
| **Profile & Vyaamikk ID** → `/(app)/profile` | Removed |
| **Profile / Business identity** → `/(app)/settings/identity` | Removed |
| — | **Profile & Business Identity** → `/(app)/settings/identity` (single row with icon + subtitle) |

### Unified route / screen
- **Route:** `/(app)/settings/identity` (unchanged path; screen upgraded)
- **Legacy redirect:** `/(app)/profile` → `Redirect` to `/(app)/settings/identity?from=settings`

### Fields shown (one screen)
1. **Identity header (indigo gradient):** Vyaamikk ID (read-only, copy), masked verified mobile, member since
2. **Your details:** salutation, name, business/profession name, field of work, designation, business email (with change-limit banners)
3. **Logo & PDF branding:** preview card, logo upload/remove, include logo on PDFs toggle, letterhead note
4. **Policy guidance:** editable vs limited fields, UEID permanence, mobile OTP flow link, Terms + Privacy links

### Edit policy behaviour
- UI: `canEditProfileField` + remaining-change banners for business name and email
- Save: `enrichProfilePatchWithPolicy(user, patch, "settings")` before `updateProfile` (limits + history)
- Footer: **Save changes** when dirty; **Go to your dashboard** when clean (no duplicate save)

### UEID display
- Shown only in Settings → Profile & Business Identity (`ProfileIdentityHeroCard`; not on You dashboard card)
- Not editable; copy-to-clipboard only

### Logo / PDF branding
- Unchanged: `identityDraft` + `persistProfileLogoFromPicker`; `pdfBranding.includeProfileLogo` toggle; letterhead exclusion note

### Route redirects / backward compatibility
- `/(app)/profile` → unified identity screen (no crash)
- You tab avatar still opens `/(app)/settings/identity?from=you`

### Performance
- One Settings row; one screen load (profile + logo only — no record queries)
- Removed second profile navigation target

### Files changed
`app/(app)/(tabs)/settings.tsx`, `app/(app)/settings/identity.tsx`, `app/(app)/profile.tsx`, `src/components/profile/ProfileIdentityHeroCard.tsx`, `src/components/profile/ProfilePolicyGuidanceCard.tsx`, `src/i18n/locales/en.ts`, `hi.ts`, `HANDOVER.md`

### Tests run
- `npx tsc --noEmit` — pass

### Untouched
Auth, UEID generation, boot onboarding, record/PDF/draft/statutory/calendar/dashboard logic, schemas.

---

## Profile “Your Details” view/edit card — 2026-06-02

### Old vs new layout
| Before | After |
|--------|--------|
| Always-visible `TextField` / picker stack under section title | **View mode:** compact `ProfileYourDetailsViewCard` (indigo header band, label/value rows, icons) |
| Limit banners above form at all times | **Edit mode:** `ProfileYourDetailsEditPanel` only after **Edit details**; policy brief + field banners inside panel |
| Footer **Go to dashboard** / **Save changes** always | Footer **Save changes** only when `(editing && details dirty) \|\| branding dirty` |

### Fields — view vs edit
| Field | View | Edit | Policy |
|-------|------|------|--------|
| Your name (+ salutation) | Read-only row | Editable | Unlimited |
| Business / profession name | Read-only; locked hint if limit reached | Editable when allowed | Max 2 changes |
| Field of work | Read-only | Editable | Unlimited |
| Designation | Read-only | Editable | Unlimited |
| Email | Read-only if set; missing guidance if empty | Editable when allowed | Max 2 changes |
| UEID / mobile | Hero card only | Not in details card | Read-only |

### Missing-field copy
`identity.details.notAdded` + per-field `identity.details.missing.*` (EN + HI).

### Edit affordance
- Header **Edit details** + pencil on view card (hidden if no editable/missing fields per `canRequestProfileDetailsEdit`).
- **Cancel** in edit panel resets form to baseline and exits edit mode.

### Policy integration
- Save still uses `enrichProfilePatchWithPolicy(..., "settings")`.
- Edit panel shows `identity.details.editPolicyBrief` and limit banners for business name / email only in edit mode.

### Compact layout / footer
- ~5 dense rows vs 6 tall inputs in default view.
- Branding (logo / PDF toggle) unchanged below; logo-only dirty still shows footer save without entering edit mode.

### Light / dark
- Indigo header band uses `authV2GradientStops`-aligned tints; card body uses `executiveCardDepth` theme surfaces.

### Files changed
`app/(app)/settings/identity.tsx`, `src/components/profile/ProfileYourDetailsViewCard.tsx`, `ProfileYourDetailsEditPanel.tsx`, `src/utils/profile/profileDetailDisplay.ts`, `src/utils/profile/identityDraft.ts` (`isDetailsFormDirty` / `isBrandingDirty`), `src/i18n/locales/en.ts`, `hi.ts`, `HANDOVER.md`.

### Tests run
`npx tsc --noEmit` — pass.

### Untouched
Auth, UEID generation, profile policy rules, records, PDFs, drafts, statutory, Calendar & Maps, sync, dashboard.

---

## Settings & Info + statutory tab move — 2026-06-02

### Bottom tab changes
| Before (4 tabs) | After (3 tabs) |
|-----------------|----------------|
| Calendar & Maps | Calendar & Maps |
| You | You |
| Statutory Information | *(removed)* |
| Settings | **Settings & Info** |

### Statutory tab removal
- `(tabs)/statutory` route file removed (it duplicated `/statutory` with the stack screen and caused **Unmatched Route**).
- Feature screen: `src/screens/StatutoryInformationScreen.tsx` at `/statutory` (same list/filters/dismissed data; no engine changes).

### New Settings & Info structure
1. **Profile & Business Identity** (+ compact sign-in activity)
2. **Statutory Information** — premium card → `/statutory`
3. **App preferences** — appearance, language, location footprints
4. **Privacy & legal** — PDF privacy, disclaimer, terms, privacy URL, delete account
5. **About** — about screen + footer attribution line
6. **Logout** — standalone card

### Statutory route migration
| Route | Behaviour |
|-------|-----------|
| `/statutory` | Statutory list (`statutory/index.tsx` + `_layout.tsx`; back → Settings & Info when `from=settings`) |
| `/statutory/detail` | Unchanged (calendar markers + list cards) |

### Calendar / prompt routing
- `StatutoryPromptSheet` **Open Statutory Information** → `/statutory`
- `calendarMapsRouting` → `/statutory/detail` unchanged
- `StatutoryPromptHost` tab guard: `you|calendar|settings` only

### Icon update
- `SettingsInfoTabIcon` — `tune-variant` + `information-outline` badge (replaces gear emoji and statutory tab icon).

### Settings page visual changes
- `SettingsInfoHero` — indigo gradient hero (auth v2 stops), command-centre copy
- `SettingsNavCard` / `SettingsNavGroup` — executive card depth, icon rings, statutory accent on compliance row

### Files changed
`app/(app)/(tabs)/_layout.tsx`, `settings.tsx`, `app/(app)/statutory/_layout.tsx`, `app/(app)/statutory/index.tsx`, `src/screens/StatutoryInformationScreen.tsx`, `src/components/settings/*`, `StatutoryPromptSheet.tsx`, `StatutoryPromptHost.tsx`, `LocationFootprintConsentHost.tsx`, `src/i18n/locales/en.ts`, `hi.ts`, `HANDOVER.md`

### Tests run
- `npx tsc --noEmit` — pass

### Untouched
Statutory deadline engine, templates, reminder offsets, dismissal/snooze SQLite, calendar merge logic, records, PDFs, drafts, auth, sync, dashboard, business forms.

---

## You dashboard — business card utility side (flip back) — 2026-06-02

### Old flipped card (removed)
- Vyaamikk ID (large mono line)
- Member since, mobile, email detail rows
- Small share icon in header only

### New utility side
- Title: **Your Business Card** + short share subtitle
- Primary **Share Business Card** button (native `Share` sheet)
- Compact chips: identity ready/pending, PDF branding on/off/logo pending, record/PDF/draft counts
- **Manage in Settings** → `/(app)/settings/identity` (Profile & Business Identity)

### Vyaamikk ID visibility
- **Removed** from You dashboard hero card (front and back)
- **Only visible** in Settings → Profile & Business Identity (`ProfileIdentityHeroCard` + live preview on that screen)
- Onboarding UEID release screens unchanged (one-time flow, not dashboard)

### Share text template (default)
```
Hello, I am {Name} from {Business/Profession Name}.

{Designation} · {Field of Work}

I manage my business records and documents with Vyaamikk Diary.

Download Vyaamikk Diary:
{App Download Link}
```

Implemented in `buildBusinessIdentityShareMessage()` with central policy in `businessIdentityShareTemplate.ts`.

### Share payload (background profile fields)
| Field | Used in share |
|-------|----------------|
| `displayName`, `salutation` | Greeting name |
| `businessName` or `workType` | “from {org}” line |
| `designation`, `workType` | Role line (`designation · workType`) |
| `env.brand.appName` | Pitch line |
| `getVyaamikkInstallUrl()` | Download link when configured |

### Privacy decisions (defaults)
- **No mobile** in share text (`includeContact: false`)
- **No email** in share text
- **No Vyaamikk ID** in share text (`includeUeid: false`)
- Optional flags in `BusinessIdentityShareTemplateOptions` for future product toggles

### Front side
Unchanged: greeting period, name, designation, avatar, business line, tap-to-flip.

### Files changed
`src/components/you/DigitalBusinessIdentityCard.tsx`, `src/utils/profile/buildBusinessIdentityShareMessage.ts`, `src/utils/profile/businessIdentityShareTemplate.ts`, `app/(app)/(tabs)/you.tsx`, `src/i18n/locales/en.ts`, `hi.ts`, `HANDOVER.md`

### Tests run
- `npx tsc --noEmit` — pass

### Untouched
Dashboard stats/sections, search, composer, records, PDF generation, statutory, calendar, auth, schemas, Settings identity save/policy logic.

---

## Indigo Design System consolidation — 2026-06-02

### Old surfaces found (pre-pass)
- Flat `Card` / form stacks with divider-only borders and no indigo focus ring
- Composer picker sheet: plain surface header, generic category rows
- `BusinessComposerForm` + `PaymentRequestFields` + `OutwardFreightFields`: duplicated inline toggle pill styles
- Validation/errors as raw red `Text` instead of `Banner`
- Many stack screens: default `Header` (grey back chip) vs auth v2 indigo executive language
- Forms not grouped in premium surfaces (single flat column)

### Shared indigo tokens / components (created or updated)
| Asset | Role |
|-------|------|
| `src/theme/formLayer.ts` | Form section titles, readable surfaces, input focus ring, sheet top border, executive back chip |
| `src/components/ui/FormSection.tsx` | Grouped fields + optional `PremiumCard` shell |
| `src/components/ui/SectionHeader.tsx` | Dashboard/list section rhythm |
| `src/components/ui/IndigoChoiceChip.tsx` | Premium enum/binary chips |
| `TextField` | Indigo focus ring via `formInputFocusedStyle` |
| `Header` | `variant="executive"` — indigo back + title |
| `Card` | `executiveCardDepth` level 2/3 (no heavy shadow in lists when `elevated={false}`) |
| `PremiumCard` | `formSurfaceStyle` indigo edge |
| `Banner` | Info tone indigo border |

### Screens / flows migrated (this pass)
- **You dashboard** — already on executive layer (hero, search, headlines, empty states); unchanged logic
- **+ New Record** — `ComposerPickerSheet` indigo header band + sheet border
- **All business composer forms** — `BusinessComposerForm` `PremiumCard` + `Banner`; chips in freight/payment/quality/follow-up
- **Composer stack** — `Header variant="executive"`
- **Settings sub-screens** — identity, about, delete, pdf-privacy, location-footprints
- **Statutory list + detail** — executive headers
- **Letterhead create, Professional Pack form, Drafts list** — executive headers

### Removed / deprecated patterns
- Duplicated toggle `StyleSheet` blocks in `BusinessComposerForm`, `PaymentRequestFields`, `OutwardFreightFields` (replaced by `IndigoChoiceChip`)
- Raw error `Text` rows in composer form (replaced by `Banner`)

### Performance safeguards
- No new blur inside list rows
- `Card` / `PremiumCard` elevation still off or soft for form shells
- `IndigoChoiceChip` is lightweight `Pressable` + border (no animation)
- Existing `memo` on list rows unchanged

### Light / dark
- Forms stay **light readable surfaces** (`surface` / `surfaceElevated`); indigo on borders, focus, headers, chips
- Dark mode: brighter primary (`#8B91FF`), muted executive gradients on picker header
- Auth v2 full-screen indigo gradient remains onboarding-only (not applied to data-entry backgrounds)

### Form readability
- Input backgrounds remain `surface` (not dark panels)
- Focus: 1.5px primary border + light shadow (iOS)
- Errors: `danger` border on field + `Banner` for form-level messages

### Business logic
**Untouched:** record schemas, PDF generation/templates, statutory engine, drafts DB, sync/auth, master data, search, calendar merge, deletion, date policies, repositories.

### Tests run
- `npx tsc --noEmit` — pass

### Remaining visual migration (optional follow-up)
- `app/(app)/diary/[id].tsx`, `diary/index.tsx` — detail/list bodies (headers optional)
- `app/(app)/at-a-glance/[view].tsx`, `search.tsx` — executive headers + preview row depth
- `app/(app)/professional-pack/[id].tsx`, `history.tsx`, `index.tsx`
- `app/(app)/letterhead/history.tsx`, `settings/disclaimer.tsx`, `settings/terms.tsx`
- Letterhead / pro-pack form field layouts (wrap sections in `FormSection` per matter type)
- `DraftUnsavedSheet` — indigo sheet header parity with composer picker

---

## App download / startup / bundle performance audit — 2026-06-03

### Expo Go vs store build (read this first)

| Symptom | Likely cause |
|---------|----------------|
| Expo Go shows “Downloading…” / slow first open | **Metro JS bundle** over the network (LAN/Wi‑Fi), not APK size |
| Slow install from Play/App Store | **Native binary + embedded assets** (APK/IPA) |

**Current dev setup:** Terminal runs `npx expo start` (no `--tunnel`). Earlier device URL `exp://192.168.29.14:8081` is **LAN** — not Expo tunnel. If loading is slow on LAN, check Wi‑Fi, firewall, and Mac disk space (shell reported **“no space left on device”** during audit — fix disk before blaming the app).

**Faster dev testing:** Same Wi‑Fi, `npx expo start --lan`, avoid `--tunnel` unless remote; or use a **development build** (`expo run:ios` / EAS dev client) for a persistent binary.

### Top 10 reasons the app may feel slow or heavy

1. **Large dev JS bundle** — React Native 0.81 + Reanimated + Gesture Handler + Maps + Calendars + Firebase SDK all ship in one Metro graph (~640MB `node_modules`; dev bundle is multi‑MB uncompressed).
2. **Expo Go cold download** — Every fresh session pulls the bundle from your Mac; network dominates.
3. **Full i18n at startup** — `en.ts` (~80KB) + `hi.ts` (~131KB) imported in `src/i18n/index.tsx` (both locales always loaded).
4. **Statutory engine on tab focus** — `StatutoryPromptHost` calls `getStatutoryPromptCardsForToday` (deadline engine + SQLite) after tab focus; now deferred (see below).
5. **Firebase in bundle graph** — `auth/index.ts` previously imported `firebase.ts` at module load even in `local-mock`; lazy `require()` added for production/shared-dev adapters only.
6. **Heavy native modules** — `react-native-maps`, `react-native-calendars`, `firebase`, `expo-print` (PDF) — loaded when their routes/modules are first required, not all at boot, but still in the dependency graph.
7. **Oversized store assets** — `assets/icon.png` **393KB** at 1024×1024 (PNG not optimized); `android-icon-foreground.png` **79KB**; total `assets/` ~**520KB**.
8. **Tab shell hosts** — `(tabs)/_layout.tsx` mounts `StatutoryPromptHost` + `LocationFootprintConsentHost` for all tabs (light UI; statutory work deferred).
9. **Debug/dev overhead** — `__DEV__` i18n missing-key warnings, Metro HMR, require-cycle warnings (auth/accountDeletion — fixed via `mockRegistry.ts` when that build is active).
10. **Release binary size (future)** — Maps + Firebase + SQLite + notifications plugins add native code; unrelated to Expo Go “Downloading…”.

### Exact weight contributors (files / packages)

| Item | Size / note |
|------|-------------|
| `assets/icon.png` | 393KB — compress with pngquant/TinyPNG before store |
| `assets/android-icon-foreground.png` | 79KB |
| `src/i18n/locales/hi.ts` | 131KB source |
| `src/i18n/locales/en.ts` | 80KB source |
| `src/services/statutory/statutoryInfoRegistry.ts` | 18KB + deadline engine |
| `node_modules` | ~640MB (firebase, maps, reanimated largest families) |
| `firebase` package | Pulled when production/shared-dev auth used |
| `react-native-maps` | Calendar tab map panel |
| `react-native-calendars` | Calendar tab |
| `expo-blur` | Tab bar `GlassSurface` only |
| `HANDOVER.md` | 208KB — **not** in app bundle |

### Startup path (runtime — correct priorities)

1. `LocalDbProvider` → SQLite init (required, stays first).
2. `AuthProvider` → SecureStore session restore after DB ready (no network in mock).
3. `app/index.tsx` boot → `resolveBootDestination` (local drafts/routes only).
4. Dashboard — diary/PDF/statutory/search **not** run at boot.

### Low-risk optimizations implemented

| Change | File |
|--------|------|
| Lazy Firebase/shared-dev auth adapters (`require` on first use) | `src/services/auth/index.ts` |
| Defer statutory auto-prompt until after interactions + 1.2s | `src/components/statutory/StatutoryPromptHost.tsx` |

### Safe recommendations (not all implemented)

- Compress `assets/icon.png` and Android adaptive icons (target &lt;80KB icon).
- Keep testing on **LAN**, not tunnel, unless remote debugging.
- Free disk space on dev machine (audit hit ENOSPC).
- Before release: `eas build` production profile; measure APK/IPA; use [Expo atlas](https://docs.expo.dev/guides/analyzing-bundles/) or `npx expo export` when disk allows.
- Optional later: lazy-load Hindi dictionary when user picks HI (medium change).
- Optional later: dynamic `import()` for map/calendar screens (router already code-splits by route file).

### Before / after observations

| Metric | Before | After (this pass) |
|--------|--------|-------------------|
| Firebase module eval on mock boot | Eager via static import | Deferred until firebase backend selected |
| Statutory prompt timing | 600ms after tab focus | After interactions + 1200ms |
| `assets/icon.png` | 393KB | Unchanged (manual compression recommended) |
| Measured Metro bundle size | Not run (disk full during audit) | Re-run after freeing disk |

### Business logic

**Untouched:** records, PDFs, statutory rules, drafts, auth flows, Calendar & Maps merge, schemas, UI design.

### Tests run

- `npx tsc --noEmit` — pass

---

## Performance verification pass #2 — 2026-06-03

### Disk space

| When | Available on `/` | Capacity |
|------|----------------|----------|
| Start of pass #2 | **~445 MiB** | 97% used |
| After icon compress + export to `/tmp` | **~386 MiB** | 97% used |

Disk is still tight; keep ≥5–10 GB free for reliable Metro caches and `expo export`.

### App icon (`assets/icon.png`)

| | Bytes | Size |
|---|------|------|
| **Before** | 393,493 | ~384 KB |
| **After** (`pngquant` 70–85) | **110,993** | ~108 KB |

No visual redesign — lossy PNG recompression only.

### Expo Go / Metro observations

- Dev server already running on **port 8081** (`npx expo start` in IDE terminal) — second `npx expo start --clear --lan` could not bind (non-interactive). Use **existing LAN URL** on device after reload.
- **Not using tunnel** — use same Wi‑Fi / `exp://<LAN-IP>:8081`.
- After `--clear` reload on device: expect first bundle build ~30–60s (one-time); subsequent reloads faster if cache warm.
- **Production export sample** (to `/tmp`, disk-safe): `npx expo export --platform ios` → **10.6 MB** `entry-*.hbc` (single main bundle in this export; dev Expo Go transfers uncompressed JS over LAN, typically larger than `.hbc`).

### Prior optimizations — behaviour unchanged

| Optimization | Status |
|--------------|--------|
| Lazy Firebase/shared-dev auth (`require` in `getAuthService`) | ✅ Code present; mock boot does not call Firebase adapters |
| Statutory auto-prompt deferred (`InteractionManager` + 1.2s) | ✅ `StatutoryPromptHost.tsx` unchanged logic |
| Hindi locale lazy-load | ✅ **Implemented this pass** (see below) |

### Hindi locale lazy-loading (implemented)

- **File:** `src/i18n/index.tsx`
- **Before:** static `import hi from "./locales/hi"` (~131KB source + `statutoryHi`) on every startup.
- **After:** only `en` static; `import("./locales/hi")` via `ensureHiDictionary()` when stored language is `hi` or user toggles HI in `LanguageToggle`.
- English-only cold start no longer evaluates `hi.ts` until needed.
- `translate()` falls back to English if HI selected before load completes; `hiRevision` bumps context after load.

### Remaining bundle-heavy modules (release analysis later)

Defer to EAS production + bundle analyzer — do not remove without proof:

- `firebase` (production/shared-dev auth only at runtime)
- `react-native-maps` + `react-native-calendars` (Calendar & Maps tab)
- `expo-print` (PDF on save)
- `@expo/vector-icons` font assets in export (~19 TTF families listed in export log)
- `reanimated` + `gesture-handler` (picker/sheet animations)
- Full `en.ts` (~80KB source) still on startup

### Business logic

**Untouched:** records, PDFs, auth flows, statutory engine, forms, dashboard UI, schemas.

### Tests run (pass #2)

- `npx tsc --noEmit` — pass
- `npx expo export --platform ios --output-dir /tmp/vyd-expo-export` — pass (10.6 MB main bundle)

---

## P0 Identity security — email ↔ mobile ↔ UEID bonding (2026-06-02)

### Current email behaviour found (before this pass)

- `businessEmail` stored as plain optional string on `UserProfile`; only `trim().toLowerCase()` normalization.
- **No** `emailIndex`, `emailHash`, `emailStatus`, or uniqueness enforcement — duplicate emails could link to multiple active UEIDs.
- Auth v2 email step saved email via `updateProfile({ businessEmail })` with no index check.
- **Critical bug:** `firebase.ts` and `shared-dev.ts` `updateProfile` omitted `businessEmail`, salutation, designation, change counts, and `profileChangeHistory` from Firestore writes — email and policy fields only persisted in local session / mock registry.
- Email verification not implemented; copy already avoided claiming verified status.
- Mobile ↔ UEID bonding already enforced via `phoneIndex` + `ueidIndex` (Firestore) and deterministic mock registry.

### Changes made

| Area | Change |
|------|--------|
| Domain | `EmailStatus`, `EmailIndexEntry`, profile fields: `normalizedEmail`, `emailHash`, `emailStatus`, `emailLinkedAt`, `emailVerifiedAt` |
| Normalization | `src/utils/emailHash.ts` — `normalizeEmail`, `hashEmail`, `maskEmail` |
| Policy | `src/services/auth/emailLink.ts` — evaluate + enrich patch; blocks duplicate active / pending-deletion emails |
| Index (local) | `mockRegistry.emailIndex` + `emailIndexLocal.ts` |
| Index (Firestore) | `emailIndex/{emailHash}` + `emailIndexFirestore.ts` (client mirror; rules locked) |
| Auth backends | `updateProfile` now runs email link policy + writes full profile via `profileFirestorePayload.ts` |
| Deletion | Retire/remove email index on account completion; lock index status on pending deletion (mock) |
| Auth v2 | Email step copy: “This email will be linked to your Vyaamikk account.”; unverified hint after save |
| Errors | `email_already_linked`, `email_pending_deletion` AppError codes with user-facing messages |
| Settings | Email change limit message now email-specific; uniqueness enforced on save via auth `updateProfile` |
| Verification | `emailVerificationService.ts` stub — `isEmailVerificationAvailable()` returns false |
| Security comms | `trustedEmail.ts` — no sensitive email until verified + provider wired |
| Rules | `firestore.rules` — `emailIndex` server-owned (`read, write: if false`) |
| Tests | `npm run test:identity-email` |

### Email uniqueness model

- **Canonical key:** `emailHash = fnv1a(normalizeEmail(raw))` where `normalizeEmail = trim + lowercase`.
- **Plain email** stored only on private `users/{uid}` (`businessEmail`, `normalizedEmail`).
- **Index doc** `emailIndex/{emailHash}` → `{ userId, ueid, status, emailStatus, linkedAt, verifiedAt }`.
- Same active email → **block** if index `userId` ≠ requester and `status === active`.
- Same UEID / same user → **allow continue** (noop).
- Pending deletion → **block reuse** until deletion completes.
- Deleted index entry → **allow reuse** (new UEID on re-register; old records stay retired).

### Mobile–email–UEID bonding logic

1. **Mobile (existing):** one active `phoneIndex` entry per E.164; UEID minted at OTP, never duplicated for same active phone.
2. **Email (new):** one active `emailIndex` entry per hash; linked to same `userId` + `ueid` as the phone-verified account.
3. **Invariant:** mobile OTP establishes account; email links to that canonical account only after policy pass.

### Verification status handling

- All newly linked emails: `emailStatus: unverified` (or `verification_pending` when `isEmailVerificationAvailable()` is true — currently false).
- `emailVerifiedAt` null until verification provider succeeds.
- **Do not** send record/PDF/security messages to unverified email (`isEmailTrustedForSecurityComms`).

### Duplicate email behaviour (UI copy)

- Another active account: “This email is already linked to another Vyaamikk account…”
- Same account: “This email is already linked to your Vyaamikk account.”
- Pending deletion: blocked with deletion-in-progress message.

### Email change policy (Settings)

- Max **2** changes after onboarding (`emailChangeCount`) — unchanged.
- Limit reached: “For account safety and misuse prevention, this email can no longer be changed from the app. Please contact support.”
- New email must pass uniqueness check via `enrichPatchWithEmailLink` before Firestore/registry write.
- `profileChangeHistory` persisted to Firestore (fixed payload).

### Deletion lifecycle impact

- **Pending deletion:** email index status → `pending_deletion` (mock); login blocked (existing).
- **Completion:** retire/delete email index; anonymize email fields on user doc; UEID retired (existing).
- Re-register with same email after deletion → allowed; **old records do not reappear** (retired UEID + local purge).

### Local mode limitation

- **local-mock:** email uniqueness enforced **on this device only** via `mockRegistry.emailIndex`.
- Cannot prevent the same email registering on another device/world without shared backend.
- Documented in i18n `identity.email.localModeLimit` and this section — **do not claim global uniqueness in local mode**.

### Firebase / server production blocker

- `emailIndex` and `phoneIndex` are **locked in firestore.rules** — client writes are best-effort (shared-dev/emulator).
- **Production requirement:** Cloud Function / Admin SDK **transaction** to atomically claim `emailIndex/{hash}` + update `users/{uid}` (same pattern as phone resolve) to eliminate race conditions.
- Full recursive server deletion still requires Admin SDK (existing blocker in `firebaseServerDeletion.ts`).

### Files changed (identity pass)

- `src/domain/types.ts`, `src/domain/errors.ts`, `src/domain/profileUpdatePolicy.ts`
- `src/utils/emailHash.ts`
- `src/services/auth/emailLink.ts`, `emailLink.test.ts`, `emailIndexLocal.ts`, `emailIndexFirestore.ts`, `emailVerificationService.ts`, `trustedEmail.ts`, `profileFirestorePayload.ts`
- `src/services/auth/mock.ts`, `mockRegistry.ts`, `firebase.ts`, `shared-dev.ts`, `normalizeProfile.ts`, `types.ts`
- `src/services/accountDeletion/markPendingDeletion.ts`, `completeDeletion.ts`, `firebaseServerDeletion.ts`
- `src/auth-v2/AuthFlowGate.tsx`
- `src/i18n/locales/en.ts`, `hi.ts`
- `firestore.rules`, `package.json`, `HANDOVER.md`

### Tests run

- `npm run typecheck` — pass
- `npm run test:identity-email` — pass

---

## DEV-ONLY reset / cleanup (2026-06-02)

### Purpose

Clear test mobile numbers, UEIDs, emails, records, drafts, PDF metadata, letterheads, master data, and app state during development. **Not** production Delete Account — no grace period, no user-facing deletion policy.

### What dev reset clears

**Local (on-device) — full reset**

| Category | Cleared |
|----------|---------|
| Session | SecureStore `vyd_session_v1/v2` |
| Identity | `vyd_mock_registry_v1` (phoneIndex, emailIndex, users, seenPhones) |
| Retired phones tombstone | `vyd_retired_phones_v1` (dev only — allows same test number fresh UEID) |
| SQLite | `form_drafts`, `entries_local`, `sync_queue`, `active_route`, `master_data_suggestions`, `statutory_occurrences`, `pincode_cache` |
| AsyncStorage | All `vyd_*` and `vyaamikk:*` keys (diary, pro packs, letterhead, drafts, auth-v2, intro, location, statutory prompt day, search, prefs) |
| Files | `documentDirectory/profile-logos/`, letterhead/PDF cache files in `cacheDirectory` |
| In-memory | Master data session cache |

**Firebase shared-dev (optional, when backend = `firebase-shared-dev`)**

- `users/{uid}` + subcollections (`entries`, `professionalPacks`, `letterheadDocs`, letterhead config)
- Best-effort delete: `phoneIndex`, `emailIndex`, `ueidIndex`, `retiredPhones`, `deletionRequests`
- Index deletes may fail under strict Firestore rules — use Admin SDK / Cloud Function if needed

**NOT cleared / outside app control**

- PDFs or files already exported, shared, or saved outside app storage
- Production Firebase (refused by guards)
- `meta` SQLite schema version row (schema kept; data wiped)

### Commands

All commands require explicit confirmation:

```bash
npm run dev:reset-local -- --confirm "RESET VYAAMIKK DIARY DEV DATA"
npm run dev:reset-firebase -- --confirm "RESET VYAAMIKK DIARY DEV DATA"
npm run dev:reset-user -- --phone 9876543210 --confirm "RESET VYAAMIKK DIARY DEV DATA"
npm run dev:reset-user -- --email test@example.com --confirm "RESET VYAAMIKK DIARY DEV DATA"
npm run dev:reset-user -- --ueid VYD-2026-XXXXXX --confirm "RESET VYAAMIKK DIARY DEV DATA"
```

| Command | Behaviour |
|---------|-----------|
| `dev:reset-local` | Prints on-device reset instructions (SQLite/AsyncStorage require the app). Validates dev guards. |
| `dev:reset-firebase` | Deletes all Firestore users in shared-dev project (Node CLI). |
| `dev:reset-user` | Targeted: prints local instructions + runs Firebase targeted delete if configured. |

**In-app (preferred for local device data):** Settings → **Developer** → **Reset dev data** (`__DEV__` builds only). Enter confirmation phrase → full or targeted reset → sign out → login.

### Local vs Firebase difference

| | local-mock | firebase-shared-dev |
|--|------------|---------------------|
| Local device wipe | In-app reset | In-app reset |
| Cross-device identity | Device only | Firestore users/indexes (CLI or in-app full reset) |
| Same test phone after reset | Fresh account on device | Fresh if both local + Firebase cleared |

### Safety guards (refuse to run when)

- `EXPO_PUBLIC_APP_MODE=production`
- Active backend is `firebase-production`
- Firebase `projectId` looks like production (heuristic: `prod`, `production`, etc.)
- Confirmation phrase missing or wrong
- In-app screen: `!__DEV__` (redirects away)

Confirmation phrase: **`RESET VYAAMIKK DIARY DEV DATA`**

### Verify reset

1. App opens at login — no session restored
2. OTP with a previously used test number → new/fresh onboarding (no old drafts on dashboard)
3. Settings → no stale profile if signed out
4. Letterhead / records / search history empty for new login
5. If shared-dev: confirm Firestore `users` empty (Firebase console)

### Files

- `src/services/devReset/*` — guards, local/firebase reset
- `scripts/dev-reset-cli.ts` — npm scripts entry
- `app/(app)/settings/dev-reset.tsx` — in-app UI
- `app/(app)/(tabs)/settings.tsx` — Developer nav link (`__DEV__` only)

### Tests

- `npm run typecheck` — pass

---

## Skeleton loading system (2026-06-02)

### Purpose

Polished, Indigo Executive–aligned skeleton placeholders for **brief** content fetches only — not a cover for broken boot, forms, or errors.

### Components created (`src/components/ui/skeleton/`)

| Component | Role |
|-----------|------|
| `SkeletonBase` | Rounded block; gentle opacity pulse via `Animated` (no shimmer) |
| `SkeletonLine` | caption/body/title line widths |
| `SkeletonCard` | Generic card shell (optional preset lines) |
| `SkeletonList` | Renders N items of a given row component |
| `SkeletonSearchResult` | Matches search / calendar / at-a-glance row layout |
| `SkeletonDashboardPreview` | Matches diary `EntryRow` card |
| `SkeletonSettingsSection` | Settings hero + nav card placeholders |
| `SkeletonDraftRow` | Matches `DraftListRow` |
| `SkeletonStatutoryCard` | Matches statutory list cards |
| `SkeletonLetterheadCard` | Matches letterhead history cards |
| `SkeletonLoadingPanel` | Wraps skeleton children; swaps to slow message after timeout |
| `useLoadingSlowWarning` | Returns `true` after **6.5s** of continuous loading |

Exported from `@/components/ui`.

### Screens integrated

| Screen | Trigger | Skeleton shape |
|--------|---------|----------------|
| Global Search (`search.tsx`) | `indexLoading` or debounced search in flight | `SkeletonList` × 6 (`SkeletonSearchResult`) |
| All Records / Diary (`diary/index.tsx`) | Initial list load, empty | `SkeletonDashboardPreview` × 8 |
| Drafts (`drafts/index.tsx`) | Initial load, empty | `SkeletonDraftRow` × 7 |
| Calendar & Maps (`calendar.tsx`) | Day list loading, empty | `SkeletonSearchResult` × 4 |
| At-a-Glance detail (`at-a-glance/[view].tsx`) | Model loading, empty | `SkeletonSearchResult` × 6 |
| Saved PDFs / Letterhead history (`letterhead/history.tsx`) | Initial load, empty | `SkeletonLetterheadCard` × 5 |
| Statutory Information (`StatutoryInformationScreen.tsx`) | View loading | `SkeletonStatutoryCard` × 4 |
| Settings & Info (`settings.tsx`) | `auth.status === 'loading'` only | `SkeletonSettingsSection` |

**Not skeletonized:** app boot (`app/index.tsx`), forms/composer, map marker overlay (text only), row-level PDF regenerate spinners, pull-to-refresh on populated lists.

### Loading timeout / fallback

- `SkeletonLoadingPanel` + `useLoadingSlowWarning` — after **6.5s** of uninterrupted loading, skeleton is replaced with i18n `skeleton.stillLoading`: *“Still loading. Please check your connection or try again.”*
- Errors still render `ErrorState` / inline error text — never hidden behind skeleton.
- Skeleton only when `loading && no cached content` (empty list / empty model).

### Performance choices

- **No shimmer** — single shared opacity pulse on `SkeletonBase` (`useNativeDriver: true`).
- Memoized row components (`memo`).
- Static themed fills: `colors.surfaceMuted` (light lilac-grey `#F3F1FA`, dark charcoal-indigo `#181C34`).
- No gradients/blur inside list skeletons; preset rows are flat bordered shapes matching real layouts.
- Animations start per-block (acceptable for short lists); not mounted at app startup.

### Unchanged

Forms, PDF generation, record schemas, auth business logic, statutory calculation logic, and delete flows were **not** modified — only loading-state UI wiring on list/detail screens above.

### i18n

- `skeleton.stillLoading` — `en.ts`, `hi.ts`

### Tests

- `npm run typecheck` — pass

---

## Letterhead PDF stabilisation & professionalisation (2026-06-04)

A core feature pass: the user uploads their own official letterhead image and the app generates a clean A4 PDF that places only their matter inside the safe writable area. **The exported Letterhead PDF carries NO Vyaamikk branding, footer, generated-by line, UEID, SPECIAL SOFTWARES line, or legal operator line** — it looks like the user's own document. (Other record/business PDFs are unchanged and still carry the standard branded footer.)

### Files changed / added

**New services (`src/services/letterhead/`)**

| File | Role |
|------|------|
| `letterheadLayoutConfig.ts` | A4 inch constants, pct↔inch margin conversion, signature/stamp bounds, safe-area defaults |
| `letterheadTemplateService.ts` | `analyzeTemplateImage()` — aspect/fit validation + warning keys |
| `letterheadAssetService.ts` | `pickLetterheadAsset()` signature/stamp picker, size guard (`MAX_ASSET_BYTES = 220 KB`) |
| `letterheadDraftMapper.ts` | `LetterheadDocumentInput` ↔ draft payload (lossless), `isLetterheadDraftMeaningful()` |

**Modified**

- `src/services/letterhead/types.ts` — new optional `LetterheadConfig` fields (`signatureDataUri`, `stampDataUri`, `defaultSenderName/Title/ComplimentaryClose`, `repeatTemplateAllPages`) and `LetterheadDocumentInput` fields (`reference`, recipient block, `salutation`, `useSignature`, `useStamp`). Updated `DEFAULT_LETTERHEAD_MARGINS` to inch-derived defaults.
- `src/services/letterhead/index.ts` — re-exports the new services.
- `src/services/letterhead/firebase.ts` — size guard includes signature/stamp; `get`/`save` carry & null-coerce the new fields (Firestore-safe).
- `src/services/pdf/letterheadPdfService.ts` — full rewrite (below). Now returns `{ html, warnings }`.
- `src/services/pdf/letterheadPdfService.test.ts` — added `position: fixed` bg + `@page` margin assertions (multi-page guarantees) alongside the no-branding checks.
- `app/(app)/letterhead/create.tsx` — sectioned form, new fields, salutation/close presets, signature/stamp toggles, in-app preview, draft save/resume + debounced recovery autosave.
- `app/(app)/letterhead/setup.tsx` — aspect-ratio warnings, optional signature/stamp management, reusable letter defaults, preserves margins/assets on "Replace".
- `app/(app)/letterhead/history.tsx` — updated to the new `{ html }` return + new labels.
- `src/components/letterhead/LetterheadPreview.tsx` — new memoized in-app A4 preview.
- `src/services/search/buildSearchableText.ts` — letterhead search also indexes reference + recipient fields.
- `src/i18n/locales/en.ts`, `hi.ts` — new `letterhead.*` keys.

### Template handling approach

- Uploaded image stored as a **base64 data URI** on `LetterheadConfig` (AsyncStorage local-mock / Firestore `users/{uid}/config/letterhead`) — no `file://` persisted.
- Rendered in the PDF as a real `<img class="letterhead-bg">` (expo-print ignores CSS `background-image` data URIs).
- JPG/PNG/HEIC supported via the existing Expo picker (base64; mime inferred).
- `analyzeTemplateImage()` warns on landscape, off-A4 aspect (±8%), low-res (<1000px), or large bytes — non-blocking.
- No template → create/regenerate redirect to setup. No Vyaamikk-branded fallback PDF is ever produced.

### Writable-area / margin defaults

- Stored as **percentages** of A4 (scale-independent); converted to **inches** for the PDF `@page` box.
- V1 defaults: **top 2.25in (19%)**, **bottom 1.25in (11%)**, **sides 1in (12%)** — within the requested ranges. Adjustable (not mandatory) in setup; clamped 0–80%.

### Dynamic fields implemented

Date (auto, editable) · Reference (optional) · Recipient name/designation/company/address (optional, multi-line) · **Subject (required, bold in PDF)** · Salutation (default “Dear Sir/Madam,”, presets + custom) · Body (required) · Complimentary close (default “Regards,”, presets + custom) · Sender name (required; prefilled from config default/profile) · Sender title · Place. Blank optional fields never print as empty headings. PDF order: date → reference → recipient → bold subject → salutation → body → closing → signature/stamp → sender name + title. Body 11.5pt, line-height 1.3, left-aligned.

### Signature & stamp support

User-scoped data-URI images saved on the config, managed in **setup**. Create has “Add my signature / stamp” toggles (disabled with hint when no asset). Signature renders above sender name (blank space + warning if selected-but-missing); stamp in the sign block. `object-fit: contain` with max bounds — never stretched; `page-break-inside: avoid` keeps the sign block together.

### Multi-page strategy

Template = `position: fixed` full-page layer → repeats on every printed page (V1 repeat-all; `repeatTemplateAllPages` reserved for future “first page only”). Writable area via `@page { margin: <inches> }` so overflow text continues on page 2+ inside the same safe area — no header/footer overlap, no silent clipping. Page size stays A4 (`pdfService` 595×842, margins 0); CSS owns margins.

### Draft / history behaviour

`draftKind: "letterhead"`, scope `letterhead_matter`. **Save Draft** + debounced (800ms) recovery autosave. Resume via `?draftId=` restores every field. Drafts appear in Saved Drafts + Search. On generate: history record saved, recovery cleared, draft marked converted, linked diary entry written (with real `reference`). Internal metadata stays in-app — never printed.

### Branding confirmation

Letterhead PDF source contains **no** `pdfFooterHtml`, `pdfLayoutCss`, `buildPdfFooterLine`, “Generated using Vyaamikk Diary”, “SPECIAL SOFTWARES”, or “Ananya Engineered” — enforced by `letterheadPdfService.test.ts` (checks the service + `create.tsx` + `history.tsx`). Only the user's template + matter appear.

### iOS / Android PDF test results

- **Automated:** `npm run typecheck` ✅ · `npm run test:letterhead-pdf` ✅ (no-branding + `position:fixed` + `@page` assertions).
- **Device QA recommended (not run here):** on real iOS + Android verify (a) template fills A4, (b) page-2 text of a long body stays in the safe area (iOS WebKit `@page` margin honoring is the key thing to eyeball), (c) signature/stamp placement, (d) Hindi/mixed text.

### Remaining limitations

- iOS multi-page header protection relies on WebKit honoring `@page` margins — validated on Chromium (Android); eyeball on iOS for very long letters.
- “First page only” mode: field exists, UI not implemented (V1 repeats all pages).
- Firestore 1 MB cap: template + signature + stamp share one config doc; oversize assets rejected with a clean message (Storage offload is future work).
- Recovery autosave is debounced/best-effort.

### Tests (letterhead)

- `npm run typecheck` — pass
- `npm run test:letterhead-pdf` — pass

---

## Skeleton loading system (2026-06-02)

### Purpose

Polished, Indigo Executive–aligned skeleton placeholders for **brief** content fetches only — not a cover for broken boot, forms, or errors.

### Components created (`src/components/ui/skeleton/`)

| Component | Role |
|-----------|------|
| `SkeletonBase` | Rounded block; gentle opacity pulse via `Animated` (no shimmer) |
| `SkeletonLine` | caption/body/title line widths |
| `SkeletonCard` | Generic card shell (optional preset lines) |
| `SkeletonList` | Renders N items of a given row component |
| `SkeletonSearchResult` | Matches search / calendar / at-a-glance row layout |
| `SkeletonDashboardPreview` | Matches diary `EntryRow` card |
| `SkeletonSettingsSection` | Settings hero + nav card placeholders |
| `SkeletonDraftRow` | Matches `DraftListRow` |
| `SkeletonStatutoryCard` | Matches statutory list cards |
| `SkeletonLetterheadCard` | Matches letterhead history cards |
| `SkeletonLoadingPanel` | Wraps skeleton children; swaps to slow message after timeout |
| `useLoadingSlowWarning` | Returns `true` after **6.5s** of continuous loading |

Exported from `@/components/ui`.

### Screens integrated

| Screen | Trigger | Skeleton shape |
|--------|---------|----------------|
| Global Search (`search.tsx`) | `indexLoading` or debounced search in flight | `SkeletonList` × 6 (`SkeletonSearchResult`) |
| All Records / Diary (`diary/index.tsx`) | Initial list load, empty | `SkeletonDashboardPreview` × 8 |
| Drafts (`drafts/index.tsx`) | Initial load, empty | `SkeletonDraftRow` × 7 |
| Calendar & Maps (`calendar.tsx`) | Day list loading, empty | `SkeletonSearchResult` × 4 |
| At-a-Glance detail (`at-a-glance/[view].tsx`) | Model loading, empty | `SkeletonSearchResult` × 6 |
| Saved PDFs / Letterhead history (`letterhead/history.tsx`) | Initial load, empty | `SkeletonLetterheadCard` × 5 |
| Statutory Information (`StatutoryInformationScreen.tsx`) | View loading | `SkeletonStatutoryCard` × 4 |
| Settings & Info (`settings.tsx`) | `auth.status === 'loading'` only | `SkeletonSettingsSection` |

**Not skeletonized:** app boot (`app/index.tsx`), forms/composer, map marker overlay (text only), row-level PDF regenerate spinners, pull-to-refresh on populated lists.

### Loading timeout / fallback

- `SkeletonLoadingPanel` + `useLoadingSlowWarning` — after **6.5s** of uninterrupted loading, skeleton is replaced with i18n `skeleton.stillLoading`: *“Still loading. Please check your connection or try again.”*
- Errors still render `ErrorState` / inline error text — never hidden behind skeleton.
- Skeleton only when `loading && no cached content` (empty list / empty model).

### Performance choices

- **No shimmer** — single shared opacity pulse on `SkeletonBase` (`useNativeDriver: true`).
- Memoized row components (`memo`).
- Static themed fills: `colors.surfaceMuted` (light lilac-grey `#F3F1FA`, dark charcoal-indigo `#181C34`).
- No gradients/blur inside list skeletons; preset rows are flat bordered shapes matching real layouts.
- Animations start per-block (acceptable for short lists); not mounted at app startup.

### Unchanged

Forms, PDF generation, record schemas, auth business logic, statutory calculation logic, and delete flows were **not** modified — only loading-state UI wiring on list/detail screens above.

### i18n

- `skeleton.stillLoading` — `en.ts`, `hi.ts`

### Tests

- `npm run typecheck` — pass


---

# Finish Core App Development Fast — Handover

This pass closed six product gaps in the exact priority order requested, with no
rewrite of existing business logic, auth/identity hardening, statutory logic,
Calendar & Maps, drafts, search, or non-PO/non-letterhead PDFs.

## 1. Saved Letterhead documents are editable

- `LetterheadDocument` extended with internal-only metadata: `firstGeneratedAt`,
  `lastEditedAt`, `version`, and `editHistory[]` (`src/services/letterhead/types.ts`).
- Firestore reader (`documents-firebase.ts`) parses these plus the full input block
  (reference, recipient block, salutation, signature/stamp toggles) so nothing is
  dropped on read.
- `app/(app)/letterhead/create.tsx` accepts an `editDocId` param: loads the saved
  document back into the form, disables recovery autosave + draft-save while editing,
  and on submit updates the existing doc (bumps `version`, sets `lastEditedAt`, appends
  an `editHistory` entry) instead of creating a new one. Original `firstGeneratedAt`
  is preserved.
- `app/(app)/letterhead/history.tsx` shows an **Edit** action per row plus version /
  created / modified metadata.
- The exported PDF is unchanged: still **no Vyaamikk branding, footer, disclaimer,
  UEID, SPECIAL SOFTWARES, or operator text**. The metadata lives only in-app.

## 2. Saved Records bottom tab + hub

- New 4-tab bar: Calendar & Maps / You / **Saved Records** / Settings & Info
  (`app/(app)/(tabs)/_layout.tsx`, `SavedRecordsTabIcon`).
- `app/(app)/(tabs)/saved-records.tsx` renders a categorized, Indigo-aligned grid with
  per-category count + latest-item preview. Categories: All records, Letterheads,
  Professional Packs, Purchase Orders, PDFs & documents, Drafts, Payment Requests,
  Cash Paid, Freight, Material Dispatch/Receipt, Staff/Work, Reminders.
- `src/services/savedRecords/savedRecordsService.ts` aggregates counts/latest across
  diary, letterhead, pro-pack, drafts, and purchase-order repositories.
- `app/(app)/diary/index.tsx` accepts an optional `type` param to pre-filter the list
  so category tiles deep-link correctly. Existing routes/search/calendar links unchanged.
- The You dashboard was slimmed (removed Saved Drafts / Needs Attention / Saved PDFs
  blocks) so it stays identity + preview focused.

## 3. Purchase Order (riskiest — serial numbering)

- Domain model `src/domain/purchaseOrder.ts`: `formatPoNumber` -> **`VYD-PO-0001`**
  standard, `computePurchaseOrderTotal`, `isPoDateAllowed` (today or up to 7 days back,
  no future), `DEFAULT_PO_TERMS`.
- Repositories: `mock.ts` (AsyncStorage, persistent serial counter) and `firebase.ts`
  (**atomic serial allocation via Firestore `runTransaction` on a counter doc** — serials
  are monotonic and never reused, even after cancel/delete). PDF URIs are never stored
  remotely.
- `allocateSerial` / `create` / `update` / `cancel` / `remove` enforce the policy:
  - **Edit** keeps PO number + `firstGeneratedAt`, advances `lastEditedAt`/`version`.
  - **Cancel** sets `status="cancelled"`, keeps the number (no reuse).
  - **Delete** is hard-restricted to the most recent (highest-serial) PO only.
- `src/services/pdf/purchaseOrderPdfService.ts` builds a professional A4 PO: prominent
  number, date, buyer identity, supplier, item table, totals, configurable T&C,
  authorized-by area, modified date when edited, CANCELLED watermark when cancelled.
  Footer is the minimal allowed line **"Created using Vyaamikk Diary."** only.
- Screens: `app/(app)/purchase-order/form.tsx` (create/edit, dynamic items, date policy,
  buyer defaults from profile) and `index.tsx` (list with regenerate/edit/cancel/delete).
  Entry added under **+ New Record** via `composerOptions`, `ComposerPickerSheet`, and
  `categoryAccentResolver`.

## 4. + New Record headline cleanup

- `ComposerPickerSheet.tsx` header simplified to a single headline
  `you.pickerHeadline` = **"Select the record you want to enter"**; removed the repeated
  "New Record" kicker and redundant subtitle.

## 5. You hero card content (flip animation untouched)

- `src/components/you/DigitalBusinessIdentityCard.tsx`:
  - **Front** now carries two compact identity chips (identity-ready + PDF-branding /
    details-embedded) — no raw profile data.
  - **Back** replaced profile details (Vyaamikk ID / email / mobile / member-since) with
    a 2x2 grid of **live counters**: PDFs generated, Records entered, Map pins, Drafts
    saved — plus existing **Share Business Card** and **Manage in Settings** actions.
- Map-pin counting added: `localEntriesRepository.countMapPinsForUser` (LIKE query for
  `gps`/`geo` payloads), surfaced through `identityCardTrustStats` and the
  `useIdentityCardTrustStats` hook (`mapPinsCount`).
- Share text already excludes Vyaamikk ID + contact by default
  (`DEFAULT_BUSINESS_IDENTITY_SHARE_TEMPLATE`: includeUeid:false, includeContact:false)
  and matches the requested clean format. Vyaamikk ID remains visible only in
  Settings -> Profile & Business Identity.

## 6. Appearance / Light-Dark-System

- `src/theme/ThemeContext.tsx`: replaced imperative `Appearance.getColorScheme()` +
  manual change/AppState listeners with RN's reactive `useColorScheme()` as the single
  source of truth for OS theme. Result: System follows OS live, Light/Dark force
  immediately, preference persists (AsyncStorage `vyd_theme_mode_v1`), default System.
  Persisted mode is restored before the splash hides (gated on db-ready), avoiding flicker.
- `app/(app)/(tabs)/settings.tsx`: bulky 3-row radio list replaced with a **compact
  segmented control** (System / Light / Dark) on a single row, Indigo Executive styled.

## Files changed (this pass)

- `src/services/letterhead/types.ts`, `documents-firebase.ts`, `index.ts`
- `app/(app)/letterhead/create.tsx`, `history.tsx`
- `app/(app)/(tabs)/_layout.tsx`, `saved-records.tsx`, `you.tsx`, `settings.tsx`
- `src/components/savedRecords/SavedRecordsTabIcon.tsx` (new)
- `src/services/savedRecords/savedRecordsService.ts` (new)
- `app/(app)/diary/index.tsx`
- `src/domain/purchaseOrder.ts`, `src/domain/composerOptions.ts`
- `src/services/purchaseOrder/{types,mock,firebase,index}.ts` (new)
- `src/services/pdf/purchaseOrderPdfService.ts` (new)
- `app/(app)/purchase-order/{_layout,form,index}.tsx` (new)
- `src/components/composer/ComposerPickerSheet.tsx`, `src/theme/categoryAccentResolver.ts`
- `src/components/you/DigitalBusinessIdentityCard.tsx`
- `src/hooks/useIdentityCardTrustStats.ts`, `src/services/dashboard/identityCardTrustStats.ts`
- `src/repositories/localEntriesRepository.ts`
- `src/theme/ThemeContext.tsx`
- `src/i18n/locales/en.ts`, `hi.ts`

## Tests performed

- `npm run typecheck` — pass
- `npm run lint` — pass (aliases typecheck)
- Manual device/render testing was not run in this environment; see limitations.

## Remaining limitations

- Live PO PDF rendering on physical iOS/Android, and Hindi-script PO/letterhead PDFs,
  were not verified on-device here — recommend a smoke test of generate + share.
- Saved Records does not yet have its own in-hub search box; it relies on the existing
  global search. Per-category open/edit/delete is wired through existing screens.
- Theme flicker is avoided via splash gating; an extreme cold-start where AsyncStorage
  read is slower than db-ready could in theory show one frame of the default System theme.

---

# Refinement Pass — Saved Records routing, Hero chips, Terms/Privacy, Appearance, Footer, Purchase Order A–J

This pass closed six focused product gaps. No changes to auth/identity bonding, UEID
lifecycle, statutory logic, Calendar & Maps, drafts, search, sync, or saved-record
schemas beyond the additive Purchase Order fields. Indigo Executive design preserved.
`npm run typecheck` and `npm run lint` both pass; `test:inr-words` and
`test:letterhead-pdf` pass.

## 1. Saved Records category "+ New" routing

Every category page now lands the user directly in the matching creation flow instead of
the You dashboard:

- The scoped diary list (`app/(app)/diary/index.tsx`) `goNew()` pushes
  `/(app)/composer/[type]` with `{ type: entryType, from: "diary" }` when the list is
  scoped to a single type (Payment Requests, Cash Paid, Freight, Material Dispatch,
  Material Receipt, Staff/Matter, Work). Only the unscoped All-records list falls back to
  the composer picker. The empty-state action calls the same `goNew()`.
- Letterheads → `/(app)/letterhead/create` (auto-redirects to `/(app)/letterhead/setup`
  when no template is configured).
- Professional Packs → `/(app)/professional-pack`.
- Purchase Orders → `/(app)/purchase-order/form`.

Back behaviour preserved: PO list `goBack()` returns to the picker/Saved Records;
scoped composer carries `from: "diary"`.

## 2. You hero card chips + utility counters

`src/components/you/DigitalBusinessIdentityCard.tsx`:

- Flip animation untouched.
- Front: time-aware greeting, name, designation, business/profession name, logo/avatar,
  language toggle, plus compact premium chips with icons (Secure business profile,
  Details embedded, PDF identity ready / Private by design). `UtilityChip` now takes an
  optional `MaterialCommunityIcons` name and uses indigo-tinted styling.
- Back: live counters only (Records entered, PDFs generated, Saved drafts, Map pins) via
  `useIdentityCardTrustStats` (added `mapPinsCount` from
  `localEntriesRepository.countMapPinsForUser`), plus Share Business Card action.
- No Vyaamikk ID / email / mobile / member-since on the card; Vyaamikk ID remains only in
  Settings → Profile & Business Identity.

## 3. Terms of Use + Privacy Policy consolidation

`app/(app)/(tabs)/settings.tsx`: the duplicate legal rows are replaced by a single
"Terms of Use & Privacy Policy" row that opens `env.brand.legalUrl` via the existing safe
URL opener. URL is sourced from one constant added in `src/config/env.ts`
(`legalUrl`, env `EXPO_PUBLIC_LEGAL_URL`). The in-app legal callback was removed.

## 4. Appearance Light/Dark/System fix + compact UI

- Root cause of "system stays light": `app.json` hardcoded `"userInterfaceStyle":
  "light"`. Changed to `"automatic"`.
- `src/theme/ThemeContext.tsx` uses React Native `useColorScheme()` for reactive OS
  tracking; persisted preference is restored before splash hides (no flicker). Default is
  System.
- Settings UI replaced with a compact segmented control (System / Light / Dark).

## 5. Settings footer cleanup

`app/(app)/(tabs)/settings.tsx` and `app/(app)/settings/about.tsx`: footer is centered
and shows only app name, tagline, version/build, and "Designed and developed by SPECIAL
SOFTWARES". The line "Legally operated by Ananya Engineered Industrial Components & Pay
Systems LLP." was removed from all in-app UI (kept only for future public webpages).

## 6. Purchase Order A–J

Domain (`src/domain/purchaseOrder.ts`), repos (`mock.ts`, `firebase.ts`), input types,
PDF service (`src/services/pdf/purchaseOrderPdfService.ts`), and form
(`app/(app)/purchase-order/form.tsx`) were extended:

- **A. Unit dropdown** — `PO_UNIT_OPTIONS` (Pcs, Kgs, Bags, Boxes, Bori, Units, Meter,
  Litre, Set, Pair, Nos, Other) via new keyboard-safe modal `SelectField`
  (`src/components/ui/SelectField.tsx`); "Other" reveals a free-text field.
- **B. Amount in words** — uses existing `formatINRInWords` (`src/utils/money/inrWords.ts`,
  en + hi) on the form and PDF, with "Only" suffix.
- **C. GST/tax** — optional `taxApplicable` (none / applicable / as_applicable), GST rate
  dropdown (0/5/12/18/28/Custom). `computePurchaseOrderTax` infers CGST/SGST vs IGST only
  when both GSTINs' state codes are present; otherwise no legal certification. "As
  applicable" surfaces the "Taxes shall be applicable as per prevailing law" term.
- **D. Wording / parties / shipping** — "Vendor / Supplier" and "Buyer / Order To"; a
  separate shipping block with a "Same as Buyer" toggle that copies buyer details.
- **E. GSTIN** — mandatory, validated by `src/utils/gst/gstin.ts` (15-char regex);
  state name + 2-digit code shown on form and PDF; inline warning when the GSTIN-derived
  state differs from the entered state.
- **F. PIN** — mandatory 6-digit PIN for vendor and buyer; state auto-resolved from PIN
  (debounced) where resolvable, manual otherwise.
- **G. Concerned person** — optional name/phone/email for vendor and buyer with
  email/phone validation when entered.
- **H. Logo** — "Use profile/company logo" toggle; logo data-URI is passed to the PDF on
  generate and regenerate, honouring the saved preference; falls back gracefully with an
  "add logo in Profile" hint when none exists.
- **I. PDF** — A4 layout with prominent PO number, party/shipping blocks, GSTIN+state,
  item table (qty/unit/rate/tax/amount), tax summary, amount in words, T&C, signature
  block, and a single minimal "Created using Vyaamikk Diary." line. CSS handles wrapping
  and clean page breaks.
- **J. Item structure** — mandatory `itemName` plus up to 5 optional description lines
  (≤90 chars each); legacy `description` retained (deprecated) for backward compatibility.

Serial/reference policy, edit history, modified-date display, and date policy are
unchanged and intact.

## Files changed (this pass)

- `app/(app)/diary/index.tsx`
- `app/(app)/(tabs)/saved-records.tsx`, `app/(app)/(tabs)/settings.tsx`
- `app/(app)/settings/about.tsx`
- `app/(app)/purchase-order/form.tsx`, `app/(app)/purchase-order/index.tsx`
- `src/components/you/DigitalBusinessIdentityCard.tsx`
- `src/components/ui/SelectField.tsx` (new), `src/components/ui/index.ts`
- `src/services/pdf/purchaseOrderPdfService.ts`
- `src/services/purchaseOrder/{types,mock,firebase}.ts`
- `src/services/savedRecords/savedRecordsService.ts`
- `src/domain/purchaseOrder.ts`, `src/domain/composerOptions.ts`
- `src/utils/gst/gstin.ts` (new)
- `src/config/env.ts`, `src/theme/ThemeContext.tsx`, `app.json`
- `src/i18n/locales/en.ts`, `src/i18n/locales/hi.ts`
- `src/repositories/localEntriesRepository.ts`,
  `src/services/dashboard/identityCardTrustStats.ts`,
  `src/hooks/useIdentityCardTrustStats.ts`
- Removed duplicate `src/utils/format/amountInWords.ts`

## Tests run

- `npm run typecheck` — pass
- `npm run lint` — pass (alias of typecheck)
- `npm run test:inr-words` — pass
- `npm run test:letterhead-pdf` — pass

## Remaining limitations

- iOS/Android `expo-print` PO rendering (logo, tax table, page breaks) was not verified
  on-device; recommend a generate + share smoke test.
- PIN → state resolution relies on the existing PIN dataset; unresolved PINs fall back to
  manual state entry.
- GST split (CGST/SGST vs IGST) is inferred only from GSTIN state codes; no external tax
  certification is performed.

---

## Refinement pass — Customer Credit closure, distance insights, You hero (2026-06-04)

### 1. EMI / Customer Credit fully-paid closure flow

Shop-managed credit/EMI (`shop_emi`, `shop_credit`, shop-follow-up external finance) no longer flips to “Fully paid” via a one-tap alert. **Mark Fully Paid** routes to `app/(app)/customer-credit/close.tsx`, which collects:

- Final payment date (not in the future), amount, mode, optional reference
- Paid-by: customer / family / business rep / other (+ payer name, relation, optional mobile)
- Received/recorded by (defaults to current profile)
- Optional remarks; balance adjustment when amount ≠ outstanding (waiver, round-off, extra charge)
- Rules enforced in UI before `closeFullyPaid()` on the repository

**Persistence:** `CreditClosureMetadata` on `CustomerCreditRecord.closure`; final payment appended to ledger; status `fully_paid`; edit history action `"closed"`. Cloud sync strips local-only `paymentProofUri` (field reserved; picker UI not wired yet).

**PDF / statement:** `customerCreditPdfService` adds a closure block with factual wording — **“Closed as per user-entered record.”** — no NBFC/recovery/KYC language. Detail screen shows closure summary when `record.closure` exists.

### 2. Closure metadata & PDF behaviour

| Field | Stored | In PDF |
|--------|--------|--------|
| Final payment date/amount/mode | ✅ | ✅ |
| Paid-by / third-party payer | ✅ | ✅ |
| Recorded by, closed on | ✅ | ✅ |
| Waiver / round-off / extra | ✅ | ✅ when not exact |
| Payment proof attachment | schema only | — |

### 3. Distance calculation method

- **Source:** Offline PIN centroids (`resolvePinCentroid` / existing Indian postal data) — no third-party routing APIs.
- **Formula:** Haversine great-circle km (`src/utils/geo/haversine.ts`), rounded to 0.1 km.
- **When missing coords:** `distanceSource: 'unknown'`, no km shown, save never blocked.
- **Wording:** “Approx.” / `businessInsights.routeKm` — not road distance.
- **Stored per movement:** `MovementDistanceRecord` in AsyncStorage `vyd_movement_insights_v1_<userId>`.
- **Hooked on save:** `recordMovementFromBusinessEntry` from `saveComposerEntry` for `material_dispatched`, `material_received`, `outward_freight_details`.

### 4. Master insights under Settings & Info

- **Route:** Settings tab → **Business Data & Insights** → `app/(app)/settings/business-insights.tsx`
- **Summary:** `loadMasterInsightsSummary` — records, PDFs, credit/EMI counts, total approx. km, pending balances, top routes/parties/transporters/locations (from `masterDataRepository` + movement repo).
- **Cache:** In-memory memo; invalidated on save/delete/close and account purge.

### 5. Search integration

- `indexMovementRecord` indexes PIN pairs and route labels into global search (`route_insight` category).
- Credit records already indexed via `indexCustomerCredit`.
- Index rebuilt on focus / `invalidateGlobalSearchIndex()` after mutations.

### 6. You hero live counters & reset-to-front

- `DigitalBusinessIdentityCard`: `useFocusEffect` resets flip to front when returning to You tab.
- **Back side counters (5):** records, PDFs, credit records, active EMI, approx. distance (+ drafts in layout); motivation subtitle (professional, not gamified).
- **Front chips:** secure profile, details embedded, private by design, PDF identity ready.
- Stats from `identityCardTrustStats` (+ movement total km).
- **No** UEID/email/mobile on hero (UEID remains Settings → Profile only).

### 7. User-scoping / privacy safeguards

- Movement insights and master summary keyed by `userId`; purged in `purgeLocal` on account deletion.
- No production logging of names, PIN routes, or distances.
- No cross-user aggregation or sharing.
- Removing a master-data suggestion does not delete source records.

### 8. Files changed (this pass)

**Closure:** `src/domain/customerCredit.ts`, `src/services/customerCredit/{types,shared,mock,firebase}.ts`, `app/(app)/customer-credit/{close.tsx,[id].tsx}`, `src/services/pdf/customerCreditPdfService.ts`, `src/domain/customerCredit.test.ts`

**Distance / insights:** `src/utils/geo/haversine.ts`, `src/utils/geo/haversine.test.ts`, `src/domain/movementInsight.ts`, `src/services/insights/*`, `src/services/diary/saveComposerEntry.ts`, `src/services/masterData/masterDataRepository.ts`, `app/(app)/settings/business-insights.tsx`, `app/(app)/(tabs)/settings.tsx`

**Hero:** `src/services/dashboard/identityCardTrustStats.ts`, `src/hooks/useIdentityCardTrustStats.ts`, `src/components/you/DigitalBusinessIdentityCard.tsx`

**Search / purge:** `src/services/search/{indexMovementInsights.ts,indexDocuments.ts,types.ts,globalSearchRepository.ts}`, `src/services/accountDeletion/purgeLocal.ts`

**i18n:** `src/i18n/locales/en.ts`, `src/i18n/locales/hi.ts` · **package.json:** `test:haversine`

### 9. Tests run

- `npm run typecheck` — pass
- `npm run lint` — pass (alias of typecheck)
- `npm run test:customer-credit` — pass (includes `shouldUseClosureFlow`)
- `npm run test:haversine` — pass

### 10. Remaining limitations

- Closure **payment proof** attachment UI not implemented (metadata field reserved).
- **No inline “Approx. X km”** on freight/dispatch/receipt composer rows yet (distance stored silently on save).
- Customer Credit save does not yet ingest delivery PIN into movement insights (only diary freight/dispatch/receipt).
- Hindi strings for some newer English-only keys may still fall back to English via i18n.
- Road/routing distance APIs intentionally not used in V1.
- On-device smoke test recommended for closure sheet + PDF + insights screen.

---

## Device / smoke test report — closure, insights, hero (2026-06-04)

### Platform tested

| Layer | Platform | Result |
|--------|-----------|--------|
| Automated | Node `tsx` — `npm run test:smoke-refinement` | **Pass** (closure persistence, PDF HTML block, haversine, balance rules) |
| Automated | `npm run typecheck`, `test:customer-credit`, `test:haversine` | **Pass** |
| Dev session | **Expo Go iOS** via Metro `exp://…:8081`, `local-mock` backend | **Partial** — credit create/PDF/share logs observed; formal closure flow not logged in this capture |
| Web UI | `expo start --web` | **Blocked** — `react-dom` / `react-native-web` not installed; browser hit Metro root only |

### Bugs found / fixed during smoke

- **No app bugs confirmed** in this pass.
- Smoke harness only: added `scripts/smoke-refinement-pass.ts` + `npm run test:smoke-refinement` (avoids RN imports in Node).

### 1. Customer Credit / EMI closure

| Check | Headless | Device UI |
|--------|----------|-----------|
| Partial payment → balance | Pass (`appendPayment` + summary) | Not re-run end-to-end in agent session |
| Mark Fully Paid → closure sheet | `shouldUseClosureFlow` pass | Manual on Expo Go recommended |
| Original buyer / third-party payer | Pass (`applyFullClosure`) | Manual |
| Exact / underpay+waiver / overpay+extra | Pass + UI rule parity | Manual |
| Status `fully_paid` + closure metadata | Pass | Manual |
| Detail closure summary | Code present on `[id].tsx` | Manual |
| Statement PDF closure block | Pass (HTML contains closure title + note) | Dev logs show `VYD-CR-0003-statement` PDF; post-closure `-closed` hint not seen in logs |

### 2. Business distance / insights

| Check | Headless | Device UI |
|--------|----------|-----------|
| PIN pair → approx km | Pass (haversine ~1150 km Delhi–Mumbai) | Manual: save freight/dispatch with 110001→400001 |
| No fake km without geo | Pass (`unknown` contract) | Manual: invalid PIN must show 0 / omit km |
| Business Data & Insights screen | Route wired in `settings.tsx` | Manual |
| Global search `route_insight` | Index + searchable text pass | Manual |

### 3. You dashboard hero

| Check | Code / headless | Device UI |
|--------|-----------------|-----------|
| Back counters (records, PDFs, credit, EMI, distance, drafts) | Implemented in `DigitalBusinessIdentityCard` | Manual flip |
| Reset to front on return | `useFocusEffect` resets `flipProgress` | Manual tab switch |
| No Vyaamikk ID on hero | Grep: no `ueid` in `src/components/you` | Manual visual |

### 4. Regression (static)

- Saved Records / Global Search / Settings insights nav: routes and index code unchanged except movement indexing.
- Non–customer-credit PDF services: not modified in this pass.
- Typecheck/lint: **pass**.

### Remaining limitations (smoke)

- Full interactive closure sheet, insights totals after freight save, and hero flip reset need **Expo Go or iOS Simulator** confirmation by a human tester.
- Install `react-dom` + `react-native-web` if automated web smoke is desired later.
- Closure payment-proof picker still unwired.

---

## P0 identity security — mobile re-login after change (2026-06-04)

### Root cause

After OTP-verified mobile change **A → B**, login with **A** could recover the **same UEID** because:

1. **local-mock:** `phoneIndex[A]` was deleted, but `confirmOtp` still used `deriveUEIDFromPhone(A)` for “new” registrations — deterministically recreating UEID **X**. Re-keying `uid` on phone change also left an active profile at the old derived uid with phone **B**, causing ambiguous slots.
2. **shared-dev Firestore:** When `phoneIndex/{A}` was missing, `confirmOtp` re-linked `users/{derive(A)}` even when that user’s **current** mobile was already **B** — effectively undoing the migration.

### Fix (mobile index migration)

| Backend | Behaviour after fix |
|---------|---------------------|
| **local-mock** | `uid` + UEID **stable** on mobile change; `phoneIndex` updated; `releasedPhones` + `retiredPhones` tombstone for old mobile; login only via active `phoneIndex`; released phone gets **fresh** `generateUEID()`, never `deriveUEIDFromPhone`. |
| **shared-dev / firebase** | `phoneIndex` swap in transaction; `recordRetiredPhone` on old E.164 after success; removed stale re-link path; `assertNoStaleActiveAccountAtDerivedUid` blocks login when active account exists with different current mobile. |

### Email pending-verification model

- Unverified email **does not** upsert into the blocking `emailIndex` (only `verified` entries block other UEIDs).
- `src/services/auth/pendingEmailVerification.ts` — in-memory seam + 20 min TTL constant; production needs Firestore `pendingEmailVerifications` + Cloud Function `verifyAndBindEmail()`.

### Production requirements (not fully wired in client)

- Native phone OTP + `resolveOrCreateUser` / `swapPhoneNumber` in `firebase.ts` (integration seams).
- Cloud Functions (Admin SDK transactions): `claimMobile`, `changeMobile`, `startEmailVerification`, `verifyAndBindEmail`, `changeVerifiedEmail`, `deleteOrRetireIdentity`.
- Firestore rules: clients must **not** write `phoneIndex` / `emailIndex` / `retiredPhones` directly.
- Redis (optional): cache-only for hash lookups; DB/CF transaction remains authority.

### Local vs production

| | local-mock | shared-dev / production |
|--|------------|-------------------------|
| Mobile uniqueness | This device only (`phoneIndex` + `releasedPhones`) | Firestore `phoneIndex` + `retiredPhones` |
| UEID on new signup | `deriveUEIDFromPhone` (dev) / `generateUEID` if released | `generateUEID` + `ueidIndex` reservation |
| Global anti-collision | **No** | **Yes** (with server rules + CF) |

### Files changed

- `src/domain/identityRegistry.ts`, `src/domain/types.ts`, `src/domain/errors.ts`
- `src/services/auth/mobileIdentity.ts`, `src/services/auth/identityRegistry/mockMobile.ts`
- `src/services/auth/mock.ts`, `src/services/auth/mockRegistry.ts`
- `src/services/auth/shared-dev.ts`, `src/services/auth/firebase.ts`
- `src/services/auth/emailLink.ts`, `src/services/auth/pendingEmailVerification.ts`
- `src/i18n/locales/en.ts`
- `src/services/auth/identity.mobile.test.ts`, `package.json`

### Tests

- `npm run test:identity-mobile` — A→B change, released phone, stale-slot block
- `npm run test:identity-email` — duplicate verified block, pending deletion
- `npm run typecheck`

### Remaining blockers

- Production Firebase phone OTP verifier not wired (`auth_not_configured` on `confirmOtp` in `firebase.ts`).
- Email verification provider not wired — emails stay `unverified` until provider is added.
- Cloud Functions for atomic global identity not in repo (documented requirement only).

### P0 follow-up — released mobile UEID resurrection (2026-06-05)

#### Root cause

After mobile change **A → B**, login with **A** could still recover **UEID X** because:

1. **`migrateAndLoad()`** in `mockRegistry.ts` always ran legacy migration on every app restart: it re-derived `uid` from the user’s **current** `phoneE164` (`deriveMockUidFromPhone(B)`), breaking the stable-uid model and clearing the derived slot guard at `users/{derive(A)}`.
2. **`confirmOtp` (mock)** used `deriveUEIDFromPhone(A)` whenever `retired` was false — even when `releasedPhones[A]` still tombstoned **UEID X**.
3. **`confirmOtp` (shared-dev)** could fall through to `tx.set(users/{derive(A)})` after mobile change, overwriting the active account or re-issuing deterministic UEID when `retiredPhones` lookup failed.

#### Fix

| Layer | Behaviour |
|-------|-----------|
| **Registry load** | Modern `v1` registry fast-path: preserve `phoneIndex`, `releasedPhones`, stable `uid`; `reconcileRegistryPhoneIndex()` drops stale index rows only. |
| **Mock login** | `findActiveProfileForLoginPhone()` — login only when index + current mobile agree. |
| **Mock registration** | `resolveNewMockAccountUeid()` — never returns released UEID or UEID bound to another active mobile; always fresh `generateUEID()` when `releasedPhones` tombstone exists. |
| **shared-dev** | Block or fresh-register on retired phone; never overwrite active user at derived uid with different current mobile. |
| **firebase-production** | `assertNoStaleActiveAccountAtDerivedUid` + `isPhoneRetiredFirestore` on `resolveOrCreateUser`. |

#### Old phone release (A)

- **local-mock:** `applyMockMobileChange` → `releasedPhones[A]=X`, `delete phoneIndex[A]`, `recordRetiredPhoneLocal`.
- **shared-dev / firebase:** `swapPhoneNumber` / transaction → `delete phoneIndex/{A}`, `recordRetiredPhone` → Firestore `retiredPhones/{A}`.

#### New phone active binding (B)

- **local-mock:** `phoneIndex[B]=uid` (stable uid), profile `phoneE164=B`, UEID unchanged.
- **shared-dev / firebase:** `phoneIndex/{B}={uid}`, `users/{uid}.phoneE164=B`.

#### SecureStore session

- `confirmMobileChange` in `auth.tsx` calls `saveSession(next)` — session stores updated `phoneE164` **B**; no UI change.

#### Tests

- `npm run test:identity-mobile` — register A, change A→B, login B→X, login A≠X, registry reload reconciliation.
- `npm run test:identity-email` — pass (unchanged).
- `npm run typecheck` — pass.

#### Local vs Firestore

| | local-mock | shared-dev / production |
|--|------------|-------------------------|
| Release tombstone | `releasedPhones` + AsyncStorage `vyd_retired_phones_v1` | `retiredPhones/{E164}` |
| Uniqueness scope | This device | Firestore project (client writes; prod needs CF) |

#### Production Cloud Function requirement (unchanged)

Atomic `phoneIndex` swap, `retiredPhones` write, and anti-resurrection checks must run in **Admin SDK transactions** — client-side rules lock indexes (`firestore.rules`); do not rely on client-only checks for global enforcement.

---

## App-wide debug session report (2026-06-04)

Structured pass: verification and stabilisation only — no new features, no UI redesign, no broad refactors.

### 1. Commands run and results

| Command | Result |
|---------|--------|
| `npm run typecheck` | **Pass** |
| `npm run lint` | **Pass** (alias of typecheck) |
| `npm run test:identity-email` | **Pass** |
| `npm run test:identity-mobile` | **Pass** |
| `npm run test:customer-credit` | **Pass** |
| `npm run test:haversine` | **Pass** |
| `npm run test:letterhead-pdf` | **Pass** |
| `npm run test:smoke-refinement` | **Pass** |
| `npx expo-doctor` | **17/18** — `expo-blur` 14.0.3 vs SDK-54 expected ~15.0.8 |
| `npx expo export --platform ios` → `/tmp/vyd-debug-export-ios` | **Pass** (~11.1 MB main bundle) |
| `npx expo export --platform android` → `/tmp/vyd-debug-export-android` | **Pass** (~11.1 MB) |
| `npx expo install expo-font` | Applied during session (expo-doctor peer dependency) |

### 2. Errors found

| Error | Severity | Status |
|-------|----------|--------|
| `loadMockProfileByPhone` fell back to `deriveMockUidFromPhone` when phone absent from `phoneIndex` — could return wrong user after mobile change | **P0** | **Fixed** — index-only lookup + `phoneE164` match |
| Metro require cycle: `mock.ts` ↔ `accountDeletion/finalizeIfDue` | **P1** (dev/mock) | **Fixed** — dynamic `import()` of `finalizeIfDue` in `mock.ts` |
| `removeMockRegistryUser` did not clear `releasedPhones[phone]` on deletion | **P1** | **Fixed** |
| `expo-doctor` expo-blur major mismatch | **P2** | **Documented** — not upgraded (visual/regression risk) |
| `example.com` legal URLs in `env.ts` defaults | **Release blocker** | **Documented** — `appLinks.ts` warns when URL contains `example.com` |

### 3. Warnings found (not all fixed)

- **expo-blur** version skew — upgrade via `npx expo install expo-blur` when ready to regression-test glass surfaces.
- **Web**: `react-dom` / `react-native-web` now listed in `package.json`; run `expo start --web` on device QA if web is a target.
- **Legal operator copy** remains in PDF footers, Terms/Privacy **content** screens, and i18n — intentionally not shown on Settings tab footer (grep: no `LEGALLY_OPERATED_LINE` in `app/` screens).
- **local-mock** cannot enforce global mobile/email uniqueness across devices — documented in P0 identity section.
- **shared-dev** / **firebase** still static-import `accountDeletion` barrel — no cycle observed at export time; mock path was the cycle source.

### 4. Bugs fixed (this session)

1. Mock phone login after mobile change could resurrect UEID via derived-uid fallback (complements P0 index migration fix).
2. Mock registry deletion tombstone gap for `releasedPhones`.
3. Mock ↔ accountDeletion require cycle (Metro warning / fragile init order).

### 5. Files changed (debug session)

- `src/services/auth/mockRegistry.ts` — `loadMockProfileByPhone`, `removeMockRegistryUser`
- `src/services/auth/mock.ts` — dynamic `finalizeIfDue` import
- `package.json` / lockfile — `expo-font` (and existing `react-dom` / `react-native-web` entries)

### 6. Auth / Firebase status

| Area | Status |
|------|--------|
| Auth Wrapper v2 (`EXPO_PUBLIC_AUTH_WRAPPER_V2`) | Flag documented; legacy `login`/`otp` redirect when ON; `complete-profile` defers to v2 business identity |
| Mock auth | Phone index + released phones; stable uid on mobile change |
| shared-dev | Phone swap + `recordRetiredPhone`; stale re-link path removed |
| firebase production | `confirmOtp` still seam — native OTP + CF transactions **not wired** |
| SecureStore / session | Unchanged; boot via `resolveBootRoute` |
| Email | `emailLink` blocks only **verified** index entries; `emailStatus` honest |
| Production indexes | **Blocker**: phone/email/UEID/deletion atomicity requires Cloud Functions + Admin SDK (client rules lock indexes — see `firestore.rules`) |

### 7. Mobile / UEID uniqueness status

| Scenario | local-mock | shared-dev |
|----------|------------|------------|
| Register A → UEID X | Pass (tests) | CF/index required for prod |
| Change A→B, login B → X | Pass | Fixed (no stale re-link) |
| Login A after change → not X | Pass (`releasedPhones` + fresh UEID or block) | `retiredPhones` + index swap |
| Duplicate active mobile | Blocked on device registry | Firestore `phoneIndex` (server write in prod) |

**Tests:** `npm run test:identity-mobile`, `test:identity-email`.

### 8. Email verification / bonding status

- Gmail/googlemail normalization in email utilities (dots/+tags only for Google domains).
- Unverified email does not permanently block `emailIndex`.
- `pendingEmailVerification.ts` — stub/TTL seam; production provider **not wired**.
- Max email changes / release-after-verify — policy in domain; full verification flow **production blocker**.

### 9. Expo / Metro / Web status

| Item | Status |
|------|--------|
| Metro / export | iOS + Android export **pass**; bundle ~11 MB |
| expo-doctor | 1 fail: expo-blur only |
| Firebase lazy load (local-mock) | Unchanged — lazy import pattern retained |
| Web | Dependencies present in package.json; confirm with `expo start --web` if needed |
| ENOSPC | Not observed this session (disk previously freed) |

### 10. Navigation / routing status

- Bottom tabs: Calendar & Maps, You, Saved Records, Settings & Info — **no statutory tab**.
- Statutory: Settings row → `/statutory`; `StatutoryPromptHost` on tab layout (prompt host, not tab).
- Auth: `/(auth)/v2`, flag OFF preserves legacy login/otp.
- UEID display: Settings → Profile & Business Identity + auth onboarding `/ueid` only — **not** on You hero.
- No duplicate Terms rows in Settings (single combined legal link + separate disclaimer route).

### 11. Env / config issues

| Variable / area | Notes |
|-----------------|-------|
| `EXPO_PUBLIC_AUTH_WRAPPER_V2` | Documented in `.env.example` |
| `EXPO_PUBLIC_APP_MODE` | local-mock / shared-dev / production detection |
| `EXPO_PUBLIC_FIREBASE_*` | Required for shared-dev; production guard in `assertProductionConfig` |
| Legal URLs | Defaults `example.com` — **must** replace before store release |
| Dev reset | Refuses production mode |
| Auth v2 flag | Clearly off/on in env example |

### 12. Firestore rules / privacy status

- **Production** (`firestore.rules`): user data owner-scoped; `phoneIndex`, `ueidIndex`, `emailIndex` — **client read/write false**.
- **Dev** (`firestore.rules.dev`): fully open — **never deploy to production**.
- Raw phone/email not exposed via index reads (indexes locked).
- Gap: client can still write `users/{uid}` in prod rules — comment notes CF should own profile writes in strict prod.

### 13. Remaining P0 blockers (production)

1. Cloud Functions for atomic phone/email/UEID index claims and deletion retirement.
2. Real Firebase Phone Auth OTP + server-side `confirmOtp`.
3. Real email verification provider + `pendingEmailVerifications` collection.
4. Public Terms/Privacy URLs (not `example.com`).
5. Deploy **production** rules only — never `firestore.rules.dev`.

### 14. Remaining P1 / P2 issues

| Priority | Item |
|----------|------|
| P1 | Upgrade `expo-blur` to ~15.0.8 and regression-test `GlassSurface` / blur UI |
| P1 | Manual Expo Go: mobile change A→B→logout→login A must not recover UEID X |
| P1 | Manual closure sheet + business insights screen + hero flip reset |
| P2 | Hindi fallbacks for newer English-only i18n keys |
| P2 | Optional: dynamic `finalizeIfDue` in shared-dev if cycle appears in prod bundle |
| P2 | Web smoke if product wants browser QA |

### 15. Manual device QA checklist

- [ ] Auth v2 ON: new user phone → OTP → email → business → UEID → location → You
- [ ] Auth v2 ON: returning user skips completed onboarding steps
- [ ] Auth v2 OFF: legacy login + OTP still work
- [ ] Settings: change mobile A→B; logout; login B → same UEID; login A → **not** same UEID
- [ ] Settings → Profile: UEID visible; You hero: **no** UEID/email/mobile on card back
- [ ] Customer Credit: fully paid → closure sheet → PDF closure block
- [ ] Settings → Business Data & Insights after freight save with PIN pair
- [ ] Saved Records + New opens correct category form
- [ ] Statutory from Settings (not bottom tab)
- [ ] Draft resume after app kill

### 16. Safe for continued internal QA?

**Yes**, for **local-mock** and **shared-dev** internal testing on Expo Go / dev builds, with these caveats:

- Do **not** claim production readiness.
- Treat identity uniqueness on mock as **device-local** only until CF + prod Firebase OTP are live.
- Replace legal URLs and upgrade expo-blur before release candidate builds.
- Run the manual checklist above on a physical device after each identity-touching change.

**Not production-ready** until: Firebase/CF identity transactions, real phone/email verification, production Firestore rules deployment, and store-legal URLs are complete.

---

## Bundle / startup performance pass (2026-06-04)

### Baseline (before)

| Metric | Value |
|--------|--------|
| `npm run typecheck` / `lint` | Pass |
| `npx expo-doctor` | 17/18 (`expo-blur` mismatch) |
| lockfile packages | ~871 |
| iOS export modules | 3456 |
| iOS `.hbc` bundle | **11.1 MB** |
| Export assets | 54 (incl. ~3.5 MB unused icon fonts) |

### After optimisations

| Metric | Value |
|--------|--------|
| iOS export modules | **3409** (−47) |
| iOS `.hbc` bundle | **10.9 MB** (−~200 KB) |
| Export assets | **37** (only Ionicons + MaterialCommunityIcons fonts) |
| Icon font assets | ~1.7 MB (was ~4+ MB with full vector-icons set) |

### Changes (low risk, no product logic)

1. **`app.json`** — explicit `"jsEngine": "hermes"` (Expo Go / dev builds use Hermes bytecode).
2. **`src/state/auth.tsx`** — dynamic import of mock/Firestore profile loaders; `accountDeletion` status import from `accountStatus` only (avoids pulling deletion executor + Firebase at boot).
3. **Repository selectors** — lazy `require()` for Firebase adapters in `diary`, `customerCredit`, `purchaseOrder`, `professionalPack`, `letterhead` index + new `letterhead/documentRepository.ts`.
4. **`app/(app)/(tabs)/you.tsx`** — imports letterhead document repo via thin `documentRepository` (skips template/PDF helper barrel on You tab).
5. **Deferred hosts** — `DeferredStatutoryPromptHost`, `DeferredLocationFootprintConsentHost` (tabs layout); statutory/location modules load after `InteractionManager`.
6. **Vector icons** — subpath imports (`@expo/vector-icons/MaterialCommunityIcons`, `/Ionicons`) across app; **`metro.config.js`** blocks unused `.ttf` font resolutions.

### Not changed (by design)

- Record schemas, PDF templates, auth/UEID bonding, statutory due-date engine logic, navigation behaviour, visual design.
- `expo-blur` version (expo-doctor warning remains; upgrade separately with UI regression pass).

### Remaining startup risks

- **`en.ts`** still eager-loaded (required for boot copy).
- **You tab** still loads dashboard, search bar, diary list, professional pack repo (mock path only in local-mock).
- **Maps / Calendar** modules load when user opens Calendar tab (route-based split unchanged).
- **First Expo Go download** is still LAN transfer of JS bundle + assets — use same Wi‑Fi, `npx expo start --lan`, avoid VPN; cache warms on second open.

### Manual check

- [ ] Cold start Expo Go: splash → boot → You tab without errors
- [ ] Statutory prompt still appears on tabs (after ~1.2s defer)
- [ ] Location consent sheet still works
- [ ] Icons render on tab bar + Settings cards
- [ ] shared-dev sign-in still resolves profile (Firebase path loads on first OTP)

---

## Customer Credit in Firebase Console (2026-06-06)

### Your EMI record **did** save

Metro logs from a live session show:

```
[customerCredit/firebase] credit record created (firebase)
[pdf] pdf generated {"fileNameHint": "VYD-CR-0001"}
```

So **`VYD-CR-0001`** was written to Firestore under shared-dev (`firebase-shared-dev`).

### Where to look (easy to miss)

Records are **not** fields on the user document. They live in a **sub-collection**:

```
users / mock_fc3d5854c97f77dc / customerCreditRecords / cr_xxxxxxxx
```

In Firebase Console:

1. Open **Firestore → Data**
2. Click **`users`** → **`mock_fc3d5854c97f77dc`**
3. In the **middle column**, click **`customerCreditRecords`** (not just the user fields on the right)
4. You should see a document like `cr_…` with `recordNumber: "VYD-CR-0001"`, `mode: "shop_emi"` or `"credit"`, EMI `schedule`, etc.

The **`counters / customerCredit`** doc (serial `next: 1`) only tracks voucher numbering — it is not the record itself.

### Dev Firestore rules

Shared-dev uses **mock OTP without Firebase Auth**. Production `firestore.rules` require `request.auth.uid`; they apply only after real Phone Auth.

For this dev project, keep **test mode** or deploy **`firestore.rules.dev`** (fully permissive). Test mode expiry will block writes unless dev rules are deployed.

---

## Expo Go slow download — diagnosis & fix (2026-06-05)

### What is actually slow

Expo Go “Downloading…” is **not** the App Store install. It is your phone pulling the **Metro JavaScript bundle** from your Mac over Wi‑Fi.

| Metric | Measured (this project) |
|--------|-------------------------|
| Metro compile time | **~1.8 s** (3400 modules) — **not** the bottleneck |
| Dev bundle (default, unminified) | **~21 MB** |
| Dev bundle (`--minify`) | **~9.7 MB** (~54% smaller) |
| Production export (`.hbc`) | **~10.9 MB** |

**15 minutes for ~21 MB** implies an effective transfer rate of roughly **25 KB/s** — a **network / Wi‑Fi** problem, not slow bundling.

### Do this first (fastest wins)

1. **Stop the current server** (Ctrl+C) and restart with minify:
   ```bash
   npm run start:go
   ```
   (`expo start --minify --lan` — cuts the JS payload roughly in half.)

2. **Same Wi‑Fi** — Mac and iPhone on the same LAN; disable VPN on both.

3. **Use LAN, not tunnel** — URL should look like `exp://192.168.x.x:8081`, **not** `exp://*.exp.direct` (tunnel is much slower).

4. **Router / AP isolation** — Some guest networks block phone↔laptop traffic; use a normal home Wi‑Fi SSID.

5. **Second open is faster** — Metro cache warms; only the **first** cold download after `--clear` or a new project session is worst.

6. **Free Mac disk space** — Low disk causes slow Metro I/O and failed caches.

### Code changes (this pass)

| Change | Effect |
|--------|--------|
| `npm run start:go` | `--minify --lan` for Expo Go testing |
| `DeferredCalendarMapsMapPanel` | `react-native-maps` loads only after user switches to Map mode (async chunk) |

### If it is still slow after minify + LAN

- Try **iOS Simulator** on the Mac (`npx expo start --ios`) — bundle stays on localhost, no Wi‑Fi transfer.
- Build a **development client** (`expo run:ios`) — native shell installs once; later loads are smaller incremental updates.
- Avoid testing over **cellular hotspot** with asymmetric upload — phone download speed is limited by Mac upload.

---

## P0 identity architecture — mobile lock + Auth v2 only (2026-06-06)

### Part A — Self-service mobile change removed

| Item | Detail |
|------|--------|
| **Policy** | Registered mobile is a primary identity anchor; users cannot change it in-app. Support handles changes manually after verification. |
| **Settings / Profile** | `ProfileIdentityHeroCard` shows masked mobile as **Verified mobile number** (read-only); tap → support copy. |
| **Removed UI** | Change Mobile link in `ProfilePolicyGuidanceCard`, `identity.tsx`, legacy `complete-profile` form. |
| **Route** | `app/(auth)/change-mobile.tsx` → support info screen (not OTP flow); deep links cannot self-service change. |
| **Auth context** | `startMobileChange` / `confirmMobileChange` removed from `useAuth()`. |
| **Admin-only** | `src/services/auth/adminMobileChange.ts` wraps service methods for support/scripts/tests. |
| **Low-level helpers** | `applyMockMobileChange`, `shared-dev`/`mock` service methods retained for admin/tests — not callable from app UI. |

**Copy (en):** `identity.verifiedMobileLabel`, `verifiedMobileHint`, `verifiedMobileSupport`, updated `policyMobile`.

### Device remembering (privacy-safe)

| Item | Detail |
|------|--------|
| **ID** | App-generated `deviceInstallationId` (`shortId("dev")`) in SecureStore key `vyd_device_installation_id_v1` |
| **Not collected** | IMEI, hardware serial, advertising ID |
| **Registry** | `users/{uid}/trustedDevices/{deviceInstallationId}` on successful OTP login (shared-dev / production Firebase) |
| **Fields** | userId, ueid, deviceInstallationId, platform, appVersion, buildNumber, firstSeenAt, lastSeenAt, lastLoginAt, status |
| **Hook** | `recordTrustedDeviceLogin()` called from `confirmOtp` in `state/auth.tsx` (best-effort, non-blocking) |
| **Rules** | `firestore.rules` → `trustedDevices` sub-collection under `users/{uid}` |

### Part B — Indigo Auth v2 sole login

| Item | Detail |
|------|--------|
| **Entry route** | `/(auth)/v2` via `getAuthEntryHref()` / `AUTH_ENTRY_HREF` |
| **Legacy routes** | `app/(auth)/login.tsx`, `app/(auth)/otp.tsx` → permanent `<Redirect href="/(auth)/v2" />` |
| **Onboarding** | `complete-profile`, `ueid`, `location-onboarding` always use Auth v2 Indigo screens (legacy branches removed) |
| **Feature flag** | `EXPO_PUBLIC_AUTH_WRAPPER_V2` **deprecated** — `isAuthWrapperV2Enabled()` always `true`; env var ignored |
| **AuthFlowGate** | No legacy fallback redirect |

**Flow unchanged:** Phone → OTP → Email → Business Identity → UEID release → Location → Dashboard.

### Tests run

| Command | Result |
|---------|--------|
| `npm run typecheck` | pass |
| `npm run test:auth-wrapper` | pass |
| `npm run test:identity-email` | pass |
| `npm run test:identity-mobile` | pass |

### Remaining risks (unchanged)

- Production Firebase Phone Auth not wired (dev mock OTP `123456` only).
- Email verification / server-authoritative identity claims still future (Cloud Functions).
- Do **not** claim production auth readiness until real OTP + verified email + Admin SDK transactions ship.

### Manual QA matrix

- [ ] Fresh install → signed out → Indigo auth at `/(auth)/v2`
- [ ] Logout → Indigo auth
- [ ] Deep link `/(auth)/login` or `/(auth)/otp` → redirects to v2
- [ ] Deep link `/(auth)/change-mobile` → support screen, not OTP
- [ ] Profile shows read-only verified mobile; no Change Mobile button
- [ ] New + returning user onboarding paths
- [ ] Pending deletion flow still works
- [ ] UEID visible only in Settings → Profile & Business Identity

---

## Business Data & Insights pass (FY-scoped intelligence) — 2026-06-04

### Goal

Calm, compact, user-owned intelligence under **Settings & Info → Business Data & Insights**. Indian financial year (1 Apr–31 Mar) grouping; incremental indexing on save/edit/delete; no cross-user learning; no dashboard overload.

### FY utility (`src/utils/financialYear.ts`)

| Function | Purpose |
|----------|---------|
| `getCurrentFinancialYear()` | FY start year for today |
| `getFinancialYearForDate(date)` | FY for any timestamp |
| `getFinancialYearRange(fy)` | `{ startMs, endMs }` for Apr 1–Mar 31 |
| `formatFinancialYearLabel(fy)` | e.g. `FY 2025-26` |
| `startOfWeekMs` / `startOfMonthMs` | Distance period filters |
| `isFinancialYearClosed` / `isRecapPrepWindow` | Archive / recap timing |

**Tests:** `npm run test:financial-year` → `src/utils/financialYear.test.ts`

### Insight indexing layer

| Layer | Storage | Behaviour |
|-------|---------|-----------|
| **Aggregates** | SQLite `business_insights` + `business_insight_links` (DB v6) | Party, PIN, cash_paid rows per user + FY |
| **Movement** | AsyncStorage `vyd_movement_insights_v1_<userId>` | Approx. km via PIN centroid haversine |
| **FY recap** | AsyncStorage `vyd_fy_recap_v1_<userId>_<fy>` | Background prepare for closed FYs |

**Incremental sync:** `syncInsightsFromBusinessEntry`, `syncInsightsFromPurchaseOrder`, `syncInsightsFromCustomerCredit` — called after save; failures are swallowed (record save never blocked).

**Delete hooks:** `removeInsightsForDiaryEntry` (+ movement purge), `removeInsightsForPurchaseOrder`, `removeInsightsForCustomerCredit`.

**Rebuild:** `rebuildInsightsForUser()` + `scheduleInsightRebuild()` — background full rescan for existing data.

**Row shape:** `userId`, `ueid`, `financialYear`, `sourceRecordType`, `sourceRecordId`, `normalizedKey`, `displayLabel`, `metadata`, `lastUsedAt`, timestamps.

### Dashboard service (`loadBusinessInsightsDashboard`)

- **Parties:** deduped by `normalizePartyKey`, PIN + locality/state, record count, last used
- **PINs:** merged with party names, resolved locality or “Location not resolved”
- **Customers:** from Customer Credit repo at read time (FY-filtered by `saleDate`); masked mobile + last-4 for search
- **Cash paid:** FY + month totals, entry count, top recipients from `cash_paid` insight rows
- **Distance:** week / month / FY / all-time; top routes + destination PINs; label **Approx.**
- **Shop credit:** active / closed / pending summary
- **Archives:** closed FY recap snapshots (background `scheduleFyRecapPrepare`)

### UI routes

| Screen | Path |
|--------|------|
| Hub | `app/(app)/settings/business-insights.tsx` |
| Parties | `.../business-insights/parties.tsx` |
| PIN codes | `.../business-insights/pins.tsx` (tap → Global Search with PIN) |
| Customers | `.../business-insights/customers.tsx` |
| Movement | `.../business-insights/movement.tsx` |
| Cash paid | `.../business-insights/cash-paid.tsx` |
| FY recap | `.../business-insights/recap/[fy].tsx` |

**Components:** `FySelector`, `InsightsCategoryRow`, `InsightsOverviewTiles`  
**Hook:** `useBusinessInsightsDashboard`

### Hero distance (You tab)

`identityCardTrustStats` → `totalApproxDistanceKm(userId, { financialYear: getCurrentFinancialYear() })` — current FY only on flipped hero card.

### Global Search integration

| Category | Indexed from |
|----------|--------------|
| `party_insight` | `business_insights` party rows (current FY) |
| `pin_insight` | `business_insights` pin rows (current FY) |
| `route_insight` | Movement records → opens Movement detail |
| `fy_recap` | Closed FY recap snapshots |
| `customer_credit` | Existing CC indexing (name + mobile last digits) |

**Routing:** `navigateToSearchResult` → `business_insight` targets with optional `fy` param.  
**Search deep link:** `/(app)/search?q=<pin>` pre-fills query.

### Privacy & performance

- Insights keyed by `userId` only; purged in `purgeLocal` + `removeFyRecapsForUser` on account deletion
- No production logging of names, mobiles, PIN routes
- No cross-user aggregation
- SQLite aggregates avoid full DB scan on render; rebuild runs idle/background
- Recap preparation non-blocking (`setTimeout` + cached snapshot)

### Files changed (this pass)

**Domain / utils:** `src/utils/financialYear.ts`, `src/utils/financialYear.test.ts`, `src/domain/businessInsight.ts`, `src/domain/movementInsight.ts`

**DB:** `src/localDb/schema.ts`, `migrate.ts`, `init.ts`

**Services:** `src/services/insights/{businessInsightRepository,insightExtractors,insightSync,businessInsightsDashboard,fyRecapService,recordMovementFromEntry,movementInsightRepository}.ts`, hooks in `saveComposerEntry`, PO/CC forms, `userContentDelete`, `purgeLocal`, `identityCardTrustStats`

**Search:** `src/services/search/{types,indexDocuments,indexBusinessInsights,indexMovementInsights,globalSearchRepository,routing}.ts`, `app/(app)/search.tsx`

**UI:** `app/(app)/settings/business-insights*.tsx`, `src/components/insights/*`, `src/hooks/useBusinessInsightsDashboard.ts`

**i18n:** `src/i18n/locales/en.ts`, `hi.ts` · **package.json:** `test:financial-year`

### Tests run

| Command | Result |
|---------|--------|
| `npm run typecheck` | pass |
| `npm run lint` | pass (alias) |
| `npm run test:financial-year` | pass |
| `npm run test:haversine` | pass |

### Remaining limitations

- Customer Credit **delivery PIN** not wired into movement distance pipeline
- FY recap: `mostActiveMonth` / `mostUsedRecordType` not computed yet (null placeholders)
- Legacy movement rows may lack `financialYear` until re-saved or rebuild
- Cash paid search is indirect (via records / party insight); no dedicated cash summary search row
- Party/PIN search indexes **current FY** only in global index (prior FYs via hub FY selector)
- Road/routing APIs intentionally not used
- On-device smoke test recommended: hub FY switch, parties/PINs/customers lists, movement periods, recap preparing state, hero FY distance

---

## P0 Permanent Deletion Hardening (record-level)

Replaces soft-delete (`deletedAt` flags) with **hard-delete** from all app-controlled storage. Account deletion is separate.

### Central service

`src/services/records/permanentDeletion.ts` — `deleteRecordPermanently({ entityType, recordId, userId, ueid })`

Helpers: `deleteGeneratedFilesForRecord`, `deleteSearchEntriesForRecord`, `deleteInsightsForRecord`, `deleteMovementRowsForRecord`, `deleteMasterDataIfOrphaned`, `deleteFirestoreRecordAndSubcollections`, `deleteLocalRecordAndRelations`

File cleanup: `src/services/records/deletionFiles.ts` (app-controlled `documentDirectory` / `cacheDirectory` only)

Master-data orphan prune: `src/services/masterData/masterDataCleanup.ts` + `masterDataRepository.decrementUsage`

### Entities converted to hard delete

| Entity | Remote | Local files | Insights / search / calendar |
|--------|--------|-------------|------------------------------|
| Diary / composer records | `deleteDoc` | PDF + attachments | insights + movement rows removed |
| Professional packs | `deleteDoc` | PDF + attachments | search invalidated |
| Letterhead documents | `deleteDoc` | PDF | search invalidated; template kept |
| Purchase orders | `deleteDoc` | PDF | party/PIN insight links removed |
| Customer credit / EMI | `deleteDoc` | PDF + customer photo | insight links removed |
| Drafts | n/a (local) | n/a | hard discard (verified) |

**Not deletion:** PO/credit `cancelled`, credit `closed` / `fully_paid` / `written_off`.

### Firestore rules (`firestore.rules`)

Owner may `delete` own: `entries`, `professionalPacks`, `letterheadDocs`, `customerCreditRecords`, `purchaseOrders`. Counters, indexes, identity paths remain protected.

### Offline delete policy

**Option B** (matches existing sync queue): hard-delete local payload + files immediately; enqueue `{ id }` only; flush `hardDelete` on Firestore when online. Do not claim “gone everywhere” until cloud delete succeeds — pending copy shown.

### User-facing copy

- Confirm title: **Delete permanently?**
- Body: **This will remove the record from Vyaamikk Diary. You will not be able to recover it.**
- Footnote: **PDFs or documents already shared outside the app cannot be recalled.**
- Success: **Record permanently deleted.**
- Offline pending: **Deleted from this device. Cloud deletion will complete when you are online.**

Claim scope: permanently deleted from **app-controlled storage** via Vyaamikk Diary — not external PDFs, backups, or shared copies.

### Tests

`npm run test:deletion` — `src/services/records/permanentDeletion.test.ts`

Also run: `npm run typecheck`, `npm run lint`

### Remaining limitations

- Master-data prune decrements `usage_count` per deleted field value (not per-record-id ledger); shared suggestions kept when count &gt; 0
- Legacy Firestore rows with `deletedAt` still filtered from lists; opening delete on such a row will hard-remove the doc on next delete attempt
- Exported PDFs / photos already outside app directories cannot be recalled
- Firebase backup retention outside client control not addressed

---

## Material Movement (unified outward flow + receipt + return)

Information-architecture pass: one user-facing **Material Movement** feature; **Goods Sent / Dispatched** and **Freight / Transporter Update** merged into a single outward flow. Existing internal storage types unchanged (Option B).

### Removed user-facing choices

- Separate picker rows: **Goods sent / dispatched**, **Freight / transporter update**
- Saved Records filter: **Freight** (replaced by **Sent / transport**)

### Material Movement picker (`movement.tsx`)

1. **Goods sent / transport update** — dispatch + LR/GR + vehicle + freight in one sectioned form
2. **Goods received**
3. **Return / replacement**
4. Internal transfer — deferred (not shown)

### Outward movement form (`OutwardMovementFields.tsx`)

Single intelligent form for full dispatch **or** quick transport update (no sub-mode picker).

| Section | Fields |
|---------|--------|
| Movement basics | Date, party/consignee, from PIN, to PIN; optional bill/challan, E-way Bill No., reference note |
| Goods details | Optional item name/qty/unit/description, boxes, weight (item trio required only when any item field started) |
| Transport details | Transporter, LR/GR, vehicle, freight type/amount, contact, CC instruction, remarks |

**Validation (`buildOutwardMovementSchema`):**

- Required: movement date, party, **from PIN**, **to PIN**
- Save allowed with complete item line **or** transport signal (transporter / LR / vehicle / bill / boxes / weight / freight amount)
- Cannot save a record with only basics and no item or transport data

**E-way Bill No. / EBN (`src/utils/businessEntry/ewayBill.ts`):**

- Optional; if entered must be exactly **12 numeric digits** (spaces stripped on input)
- Recorded as user-entered metadata only — **not** GST-verified or app-generated

### Data strategy (Option B — compatibility)

- **Internal types preserved:** `material_dispatched`, `outward_freight_details`, `material_received`, `material_return`
- **User-facing kind:** `sent_transport` maps **both** `material_dispatched` and `outward_freight_details`
- **New saves:** unified form resolves storage type — complete item → `material_dispatched`; transport-only → `outward_freight_details`
- **Edits:** keep original internal type (no destructive migration)
- Extended payloads: `ewayBillNumber`, `materialDescription`, `referenceNote`, `freightAmount`, transport fields on dispatch rows
- Adapter: `src/domain/materialMovement.ts`, `src/utils/businessEntry/outwardMovement.ts`

### Saved Records

- Filters: All / **Sent / transport** / Received / Returns
- Old dispatch and freight records both appear under **Sent / transport**

### PDF (outward)

Adaptive title via `outwardMovementPdfTitle`:

- Item data present → **Goods Dispatch & Transport Record**
- Mostly transport/LR/freight → **Transport / Freight Update**
- Both → **Goods Dispatch & Transport Record**

Sections (Movement / Goods / Transport) render only when data exists — no empty headings.

### Search, Calendar/Maps, Insights

- E-way Bill number, freight type, transport metadata indexed in `buildSearchableText`
- PIN pairs, route/distance, party/PIN/transporter insights unchanged for both outward internal types
- Draft payload includes `movementType: sent_transport`

### Back navigation

+ New Record → Material Movement → Goods sent / transport update → Back → movement picker → + New Record (`pickerReturn: material_movement`)

### Files changed (refinement pass)

- `src/domain/materialMovement.ts`, `src/domain/composerOptions.ts`, `src/domain/businessEntry.ts`
- `src/components/composer/OutwardMovementFields.tsx` (new), `BusinessComposerForm.tsx`
- `src/utils/businessEntry/outwardMovement.ts`, `ewayBill.ts`, `validation.ts`, `payload.ts`, `formValuesFromEntry.ts`, `freightFromDispatch.ts`
- `app/(app)/composer/movement.tsx`, `app/(app)/composer/[type].tsx`
- `app/(app)/diary/material-movement.tsx`
- `src/services/pdf/businessEntryPdfTemplate.ts`, `src/services/search/buildSearchableText.ts`
- `src/i18n/locales/en.ts`, `src/i18n/locales/hi.ts` (partial)
- Field nav / validation order: `composerFieldOrder.ts`, `fieldNavOrders.ts`

### Tests run

| Command | Result |
|---------|--------|
| `npm run typecheck` | pass |
| `npm run lint` | pass |

### Remaining limitations

- Internal transfer movement kind deferred
- Deep links to `/composer/material_dispatched` or `/composer/outward_freight_details` open the unified form directly (skip movement picker) — records remain valid
- Linked-dispatch “create freight from dispatch” still routes to `outward_freight_details` composer type
- Hindi copy for new outward/E-way strings may need review
- Approx. distance in PDF not yet rendered as its own row (still fed to insights/calendar when PIN metadata exists)

---

## + New Record picker — Recent section removed

### What changed

- Removed **Recent / Recently Used** group from `ComposerPickerSheet` — picker shows grouped options only
- **Material Movement** is its own group (no longer nested under Business records)
- **Work & team** group label renamed to **Team & Work Management**
- Headline unchanged: “Select the record you want to enter” (`you.pickerHeadline`)

### Picker groups (current)

1. Business records — Payment request, Cash paid, Customer Credit, Purchase Order  
2. Material Movement  
3. Team & Work Management — expandable work/staff sub-options  
4. Documents — Letterhead, Professional Packs  

### Recent-tracking storage

- **Removed:** `src/services/composer/recentRecordTypes.ts` (AsyncStorage key `vyd_composer_recents_v1`)
- Used **only** for the picker Recent UI — not used by insights, search, or dashboard
- Orphaned key on device is harmless; no dev-reset entry was required

### Routing (unchanged)

All `+ New Record` options still route correctly via `you.tsx` → `onPickComposer`: PO, Customer Credit, Material Movement (`/composer/movement`), Work & Team sub-types, Letterhead, Pro Pack, and business composer types.

### Files changed

- `src/components/composer/ComposerPickerSheet.tsx`
- `src/services/composer/recentRecordTypes.ts` (deleted)
- `src/i18n/locales/en.ts`, `src/i18n/locales/hi.ts`

### Tests run

| Command | Result |
|---------|--------|
| `npm run typecheck` | pass |
| `npm run lint` | pass |

---

## Business PDF Redesign & Authentic Document System

### Issues found (before)

- Business diary PDFs used a flat title + line-by-line meta table dump
- Footer embedded long operator/legal text (“Ananya Engineered…”, UEID, user name, disclaimer paragraph)
- Payment Request carried an extra supplementary footer disclaimer
- Professional Pack PDFs lacked document structure and brief attribution note
- UEID shown on every business PDF profile header

### Shared PDF design system (`src/services/pdf/`)

| Module | Role |
|--------|------|
| `pdfTheme.ts` | Colours, attribution constant, document CSS tokens |
| `pdfDate.ts` | `DD MMM YYYY` + datetime formatting |
| `pdfMoney.ts` | INR + amount-in-words helpers |
| `pdfFooter.ts` | Short two-column footer |
| `pdfSections.ts` | Sections, key-facts grid, notes, brief note |
| `pdfTable.ts` | Wrapping data tables |
| `pdfComponents.ts` | Document header + issuer block (logo optional, UEID hidden by default) |
| `pdfDocumentShell.ts` | Full HTML document wrapper |
| `businessEntryPdfBodies.ts` | Per-entry-type PDF body builders |

### Footer change

- **Left:** `Created using Vyaamikk Diary.` · **Right:** `Page X`
- Removed: Ananya operator line, long legal disclaimer, UEID in footer

### Categories migrated

Payment Request, Cash Paid, Material Movement (incl. e-way bill / transport), Work & Staff, Reminders, Professional Brief, Legacy diary export; Customer Credit footer aligned.

### Excluded (confirmed unchanged)

- **Purchase Order** — `purchaseOrderPdfService.ts`
- **Letterhead** — `letterheadPdfService.ts` (branding-free)

### Tests run

| Command | Result |
|---------|--------|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run test:pdf-redesign` | pass |
| `npm run test:letterhead-pdf` | pass |

### Remaining limitations

- Customer Credit retains inline CSS (already structured; not fully tokenised)
- Multi-page `Page X of Y` depends on print engine
- Manual visual QA on device recommended for long tables
