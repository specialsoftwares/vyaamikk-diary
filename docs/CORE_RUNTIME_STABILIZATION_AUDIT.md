# Core Runtime Stabilization Audit

**Date:** 2026-07-16  
**Auditor role:** Lead reliability (code + policy evidence)  
**Branch tip before this pass:** `4d04786` (external website links)  
**Scope:** Expo React Native app core runtime — boot, providers, auth, deletion, LocalDb, sync, overlays, links, env  
**Out of scope (untouched):** Lovable website, Firebase consoles, deployed rules/data, EAS builds, DNS, Apple/Google consoles  

---

## 0. Protected baselines (must not weaken)

| Commit | Contract |
|--------|----------|
| `900c46e` | Website integration / public link layer |
| `0b12fb4` | Production origin `https://vyaamikk.specialsoftwares.com` |
| `bfc2968` | Language transition + touch-trap; **no** `I18nProvider` remount of Auth/LocalDb/Sync |
| `4a1a529` | Stable root Auth/LocalDb/Sync (never path-gated) |
| `4d04786` | Safe external HTTPS opener path |

**Product constants verified in committed config defaults:**

- Public origin: `https://vyaamikk.specialsoftwares.com`
- `/auth` forbidden as end-user website destination
- App Store / Play Store URLs empty (pre-launch; non-openable)
- Support: `support.vyd@specialsoftwares.com`

**Protected unstaged work (recorded; not staged in this pass):**

| Path | Status at audit start |
|------|------------------------|
| `src/i18n/i18n.ts` | Modified (locale-loader work) — left untouched |
| `src/i18n/validateLocales.ts` | Modified — left untouched |
| `.expo-export-audit/` | Untracked export artifacts — left untouched |
| `.env` | Gitignored; Privacy/Terms already corrected locally — uncommitted |

**Likely effect of unstaged locale-loader changes (not incorporated):** tighter or alternate locale validation / load paths. Evaluated against committed baseline only. No failure evidence required editing those files in this pass.

---

## 1. Runtime architecture map (verified)

### 1.1 Stable root provider order

Source: `app/_layout.tsx` + `src/config/rootDataProviders.ts`.

```
GestureHandlerRootView
  └─ SafeAreaProvider
       └─ ThemeProvider
            └─ I18nextProvider (i18n singleton)
                 └─ I18nProvider
                      └─ LocaleFontProvider
                           └─ LocalDbProvider
                                └─ AuthProvider
                                     └─ SyncProvider
                                          └─ AppFeedbackProvider
                                               └─ ThemedAppShell (StatusBar + Stack)
```

`decideRootDataProviders()` always returns mount flags `true` for LocalDb, Auth, Sync, AppFeedback. A hard throw fires if any flag is false (fail-closed against regression to path-gated mounts).

**Structural equivalence:** Matches required hierarchy  
`GestureHandler → SafeArea → Theme → I18n → LocaleFont → LocalDb → Auth → Sync → AppFeedback → Stack`  
(with `I18nextProvider` wrapping `I18nProvider` as the documented intentional variation for react-i18next).

### 1.2 Why path-gating is forbidden

Expo Router can retain `app/(app)/_layout` (a `useAuth` consumer) while the root layout briefly classifies a public pathname. Path-gated provider swaps previously produced `useAuth must be used within <AuthProvider>`. Fixed in `4a1a529`.

`docs/REINITIALIZATION_ARCHITECTURE_MAP.md` still describes the **old** public-route lightweight shell — **superseded** by this map and `4a1a529`. Do not use that section for provider decisions.

### 1.3 Boot sequence

1. Module load: `assertProductionConfig()`; `SplashScreen.preventAutoHideAsync()`.
2. Providers mount; `LocalDbProvider` starts `initializeLocalDatabase()` (singleton promise, migrations v1→current).
3. `AuthProvider` restores SecureStore session, revalidates with timeout; fails closed / keeps cache per existing policy.
4. `app/index.tsx` waits for DB readiness + auth settle, then `resolveBootDestination()` (local-only):
   - signed out → auth entry
   - email completion needed → `/(auth)/v2`
   - onboarding gates → onboarding href
   - draft continuation prompt (UI, not auto-open) or `/(app)/(tabs)/you`
5. Sync starts flush/pull only when auth signed-in, DB ready, and `sessionSyncGate` unlocked.

### 1.4 Route groups (high level)

| Group | Role |
|-------|------|
| `app/index.tsx` | Boot router |
| `app/(public)/` | Landing and public marketing surfaces |
| `app/legal/[doc]` | In-app legal viewer |
| `app/(auth)/` | OTP, onboarding, pending-deletion, profile completion |
| `app/(app)/(tabs)/` | Calendar / You / Settings (native tabs) |
| Modal / sheet screens | Composer, consent, CurtainSheet hosts |

### 1.5 Context providers and consumers

| Provider | Key consumers | Outlives risk |
|----------|---------------|---------------|
| ThemeProvider | ThemedAppShell, screens | Low — always mounted |
| I18nProvider | Language UI, overlays | Remount forbidden (`bfc2968`) |
| LocaleFontProvider | Textured text | Tied to I18n |
| LocalDbProvider | Auth, Sync, repositories | Always mounted |
| AuthProvider | Sync, app layouts, settings | Always mounted |
| SyncProvider | Banner, refresh, save paths | Always mounted; lock is process singleton |
| AppFeedbackProvider | Toasts / alerts | Always mounted |

**Invariant:** No language switch, public route, redirect, modal, or deep link may unmount Auth/LocalDb/Sync under a retained consumer.

### 1.6 Persistence and external boundaries

| Layer | Store | Notes |
|-------|-------|-------|
| Session | SecureStore `vyd_session_v2` | Authoritative local identity cache |
| Records / drafts / queue | SQLite (`src/localDb`) | User-scoped rows; migrations version-gated |
| Preferences | AsyncStorage | Theme, language, snoozes, consent |
| Cloud | Firestore + Storage (JS SDK) | Production requires JS auth bridge |
| Phone OTP | Native RNFirebase Auth | Expo Go → mock isolation |
| Public web | `vyaamikk.specialsoftwares.com` | Via validated HTTPS opener |

### 1.7 Error boundaries / AppState

- Sync listens to NetInfo + AppState for flush scheduling.
- Language / consent / CurtainSheet use idle + AppState failsafes (`bfc2968` / `8653e88`).
- Error screens must not depend on absent Auth (providers always present).

---

## 2. Confirmed findings and fixes (this pass)

### F1 — P1 — Session sync lock survives logout / account switch

| Field | Detail |
|-------|--------|
| **Invariant** | After sign-out, sign-in, or uid change, sync must be able to flush again without requiring a manual banner clear. |
| **Evidence** | `sessionSyncGate` is a process-wide singleton. `lock("session_expired")` from sync/auth errors; unlock was only via `SyncStatusBanner` → `clearSessionLock`. `signOut` did not unlock. |
| **Reproduce** | Sign in → force session lock (401 path) → sign out → sign in as same or other user → flush no-ops; UI can show idle/pending with no progress. |
| **Root cause** | Identity transition did not clear the module lock. |
| **Fix** | `shouldClearSyncLockOnAuthTransition` + `SyncProvider` effect unlocks on leave signed-in, fresh sign-in, or uid switch. |
| **Why correct** | Restores “lock scoped to a session identity” without removing the lock’s auth-failure purpose. |
| **Regression** | `npm run test:sync-lock-identity` — would fail if sign-out/uid-switch returned `false`. |
| **Files** | `src/sync/syncLockIdentityPolicy.ts`, `.test.ts`, `src/state/sync.tsx`, `package.json` |

### F2 — P2 — Raw `Linking.openURL(mailto:…)` can reject uncaught

| Field | Detail |
|-------|--------|
| **Invariant** | Support/contact mailto taps must not leave unhandled promise rejections / redbox freezes. |
| **Evidence** | Landing footer/CTA and legal screen used `void Linking.openURL(...)` without try/catch. HTTPS path already hardened in `4d04786`. |
| **Fix** | Pure `normalizeMailtoUrl` + `openSafeMailto` (catch failures → `false`). Wired to LandingCTA, LandingFooter, LegalDocumentScreen. |
| **Regression** | `npm run test:safe-mailto`. |
| **Files** | `src/utils/safeMailtoPolicy.ts`, `safeMailto.ts`, `.test.ts`, landing/legal callers, `package.json` |

---

## 3. Subsystems audited without confirmed P0/P1 code change

Evidence-based “no fix” means inspection found existing contracts adequate or prior commits already cover the invariant. Not a claim of exhaustive device QA.

| Subsystem | Result | Notes |
|-----------|--------|-------|
| Root providers / public routes | Pass (prior `4a1a529`) | Always-mount + tests |
| Language remount / overlay touch | Pass (prior `bfc2968`) | No mountKey remount; overlay policy tests |
| External HTTPS links | Pass (prior `4d04786`) | Reject `.in`, `/auth`, empty stores |
| Boot routing | No P0/P1 found | `resolveBootDestination` finite local outcomes |
| Auth env isolation | No P0/P1 found | Expo Go mock vs production fail-closed tests |
| Deletion / reactivation routing | No P0/P1 found | Production cancels direct cancel; requires reactivation flow with email **verification code** (not email-reply-alone). Tests: `test:reactivation-routing` |
| LocalDb init | No P0/P1 found | Singleton init promise; version-gated migrations; repair missing table without full wipe |
| Save idempotency | Covered by existing tests | `test:save-idempotency` |
| CurtainSheet / consent dismiss | Pass prior | Phase + dismiss policy tests |
| Theme remount | No P0/P1 found | Theme under I18n; appearance change does not remount Auth/DB/Sync |

### P3 / residual observations (recorded, not refactored)

| ID | Severity | Note |
|----|----------|------|
| P3-A | P3 | `docs/REINITIALIZATION_ARCHITECTURE_MAP.md` still shows path-gated providers — documentation drift |
| P3-B | P3 | `LocalDbContext` default value is a non-throwing stub; safe today because provider always mounts |
| P3-C | P3 | `expo-doctor`: `expo-build-properties` major skew (`0.14.8` vs `~1.0.10`); `expo` patch (`54.0.35` vs `~54.0.36`) — **no upgrade in this pass** |
| P3-D | P3 | Unstaged locale-loader changes unevaluated in production; keep separate from runtime fixes |
| P2-E | P2 residual | Full device matrix (OTP, deletion mid-flight, dual-device conflict) still requires physical / EAS client — see manual QA |

---

## 4. Edge-case matrix (core)

Columns: State | Event | Deps | Expected transition | User result | Persist | Retry | Cleanup | Auto | Manual | Result

### 4.1 Providers / boot

| State | Event | Deps | Expected | User | Persist | Retry | Cleanup | Auto | Manual | Result |
|-------|-------|------|----------|------|---------|-------|---------|------|--------|--------|
| Cold launch public `/` | Open landing | Root always-mount | Auth/DB/Sync stay up | Landing renders | — | — | — | `test:root-providers` | Cold open landing | Prior fix |
| Auth consumer retained | Pathname → public | Expo Router | No provider unmount | No useAuth crash | — | — | — | same | Navigate public↔app | Prior fix |
| Language settle | setLang | I18n | No provider remount | Tabs remain interactive | lang pref | — | overlay release | language-* tests | Language stress | Prior fix |
| Boot signed-out | Fresh install | DB ready | Auth entry | Login | — | — | splash hide | boot policy | Fresh install | Manual pending |
| Boot signed-in + onboarding incomplete | Cold launch | profile | Onboarding href | Gate screen | session | — | — | — | Incomplete onboarding | Manual pending |

### 4.2 Sync lock

| State | Event | Deps | Expected | User | Persist | Retry | Cleanup | Auto | Manual | Result |
|-------|-------|------|----------|------|---------|-------|---------|------|--------|--------|
| Locked session_expired | Sign out | gate singleton | Unlock | Can sign in | — | — | unlock on transition | `test:sync-lock-identity` | Lock→logout→login→pull | **Fixed F1** |
| Locked | UID switch | gate | Unlock | Sync for new uid | — | — | unlock | same | Account switch | **Fixed F1** |
| Locked same uid | Banner clear | UI | Unlock | Sync resumes | — | flush | clearSessionLock | — | Banner CTA | Existing |

### 4.3 External links / mailto

| State | Event | Deps | Expected | User | Persist | Retry | Cleanup | Auto | Manual | Result |
|-------|-------|------|----------|------|---------|-------|---------|------|--------|--------|
| Valid HTTPS privacy | Tap | opener | Safari/Chrome | Honest fail alert if open fails | — | join in-flight | finally unlock | public-links, external-https | Legal links | Prior + device |
| Empty store URL | Tap Download | resolver | Non-openable explain | Message | — | — | — | public-links | Pre-launch stores | Prior |
| `/auth` URL | Resolve | validator | Reject | No navigation | — | — | — | public-links | — | Prior |
| Support mailto | Tap | Linking | open or soft-fail | No redbox | — | — | catch | `test:safe-mailto` | Landing/legal mailto | **Fixed F2** |

### 4.4 Auth / deletion (policy)

| State | Event | Deps | Expected | User | Persist | Retry | Cleanup | Auto | Manual | Result |
|-------|-------|------|----------|------|---------|-------|---------|------|--------|--------|
| Pending deletion | Login | routing | Pending screen | Reactivate path | status | — | — | reactivation-routing | Settings delete paths | Manual pending |
| Pending (prod) | Direct cancel API | backend | Denied | Must verify email code in-app | — | — | — | cancelDeletion code | — | Code-inspected |
| Email reply only | Inbox reply | — | **Not** sufficient | Must complete in-app verify | — | — | — | copy + routing | — | Contract OK |

### 4.5 LocalDb / records / sync (summary)

| Area | Auto coverage | Manual still required | Code change this pass |
|------|---------------|----------------------|------------------------|
| Migrations singleton | init promise design | Upgrade install with data | None |
| Save idempotency | `test:save-*` | Rapid Save, background mid-save | None |
| Sync wrong-uid | engine + auth uid args | Dual account on one device | F1 lock clear |
| Offline→online flush | — | Airplane mode cycle | Manual |

---

## 5. Tests run (this pass)

```
npm run test:sync-lock-identity   # ok
npm run test:safe-mailto          # ok
npm run test:root-providers       # ok
npm run test:public-links         # ok
npm run test:external-https       # ok
npm run test:legal-consent        # ok
npm run test:curtain-phases       # ok
npm run test:language-overlay-touch # ok
npm run test:consent-dismiss      # ok
npm run test:language-transition  # ok
npm run test:auth-wrapper         # ok
npm run test:env-resolution       # ok
npm run test:reactivation-routing # ok
npm run test:save-idempotency     # ok
npm run test:js-auth-bridge       # ok
npm run typecheck / lint          # ok
npx expo-doctor                   # 17/18; version skew only (not upgraded)
```

---

## 6. Unresolved risks

| Risk | Level | Mitigation |
|------|-------|------------|
| Device OTP / JS auth bridge on real hardware | Open | `docs/CORE_MANUAL_QA_MATRIX.md` + EAS dev client |
| Dual-device conflict merge | Open | Manual + future sync harness |
| Mid-deletion process kill | Open | Manual matrix |
| Unstaged locale loader | Operational | Keep uncommitted until separate review |
| expo-build-properties skew | P3 | Owner-approved upgrade later |

**Data-loss / account-isolation / provider-remount / navigation-freeze / external-link crash / duplicate-save / failed-sync after lock:**  
No remaining **confirmed** P0 in repo from this pass. F1 removed the post-logout sync-deadlock class. Provider remount and HTTPS crash classes remain covered by prior commits. Device confirmation still required for freeze and sync under real network.

---

## 7. Commits produced by this audit

| SHA | Message |
|-----|---------|
| `c54c8c9` | Fix: clear session sync lock on auth identity change |
| `a9e0e23` | Fix: harden mailto openers against Linking failures |
| *(this docs commit)* | Docs: core runtime stabilization audit |

Protected baselines unchanged: `900c46e`, `0b12fb4`, `bfc2968`, `4a1a529`, `4d04786`.

---

## 8. Explicit non-actions

- No push, deploy, publish, or EAS build  
- No Firebase / Storage / DNS / console changes  
- No Expo / RN dependency upgrades  
- No edits to protected unstaged i18n or `.expo-export-audit/`  
- `.env` remains local and uncommitted  
