# DEBUG: Post-login first-action freeze — root cause report

**Date:** 2026-07-15  
**Commit message:** `fix(runtime): remove post-login first-action navigation freeze`  
**Runtime (operator Metro):** `activeBackend: local-mock`, `bundledAppMode/effectiveAppMode: development`, `firebaseProjectId: vyaamikk-diary`, `runtime: expo-go`

---

## Exact root cause

After login, Expo Router `NativeTabs` mounts **all** tab screens with `freezeContents={false}` (`node_modules/expo-router/build/native-tabs/NativeBottomTabs/NativeTabsView.js`). The Calendar tab therefore mounts while the user is still on You.

`app/(app)/(tabs)/calendar.tsx` scheduled `scheduleDeferredIndiaPincodeWarm(2500)` on `user?.uid`. That started `india-pincode/browser` `getIndiaPincode()`, which **fetches, gunzips (~3.3 MB), `JSON.parse`s, and indexes ~165k post offices on the JS thread**.

While that parse runs:

- Native bottom tabs stay responsive (native layer).
- Every JS `Pressable` / `router.push` / `Alert` / sheet open is delayed; queued taps drain **FIFO** when the JS thread frees.
- After the singleton load finishes, the process is warm for the rest of the session → “once per authenticated session.”

Waiting ~20 s before tapping does not help when the load still exceeds that window (prior Expo Go measurement ~53 s; Node bench ~2.3 s; devices commonly land in the reported **8–15 s** band).

This is **not** InteractionManager queuing user commands, a custom action queue, startup curtain, or letterhead migration awaiting navigation. It is **JS-thread starvation** from eager PIN DB warm on tab mount.

---

## Evidence

| Evidence | Detail |
|----------|--------|
| NativeTabs | `freezeContents={false}` — all tab React trees stay active |
| Calendar warm | `scheduleDeferredIndiaPincodeWarm(2500)` on `user?.uid` (removed this pass) |
| PIN package | `india-pincode` browser loader: fetch CDN gz → pako ungzip → `JSON.parse` → index build |
| Node timing | `getIndiaPincode()` ≈ **2288 ms** on this machine (device/Expo Go historically much longer) |
| Symptom match | Tabs OK; non-tab JS actions delayed; FIFO drain; once per session; wait-before-tap ineffective while load ongoing |
| Letterhead timing | Warning after navigation completes → **independent** defect (Firebase called despite `local-mock`) |

Optional correlated logs (off by default): set `EXPO_PUBLIC_DEBUG_FIRST_ACTION_FREEZE=1` → `[first-action-freeze]` milestones in Metro.

---

## Event sequence (post-login)

1. Phone auth / onboarding success → auth publishes `signed_in`
2. Boot resolves → `router.replace("/(app)/(tabs)/you")` → `markBootNavigationSettled()`
3. Tabs layout mounts → **Calendar + You + Saved + Settings** React trees mount
4. Calendar effect schedules PIN warm (+2.5 s after interactions)
5. Dashboard committed / interactive visually; native tabs work
6. ~T+2.5 s: `getIndiaPincode()` occupies JS thread for seconds–tens of seconds
7. First feature press enters native queue; handler runs only after parse completes
8. Multiple presses drain FIFO → navigations/sheets open in tap order
9. Subsequent presses immediate (lookup singleton cached)
10. Later (async): letterhead migration `getDoc` → `permission-denied` (separate)

---

## Why bottom tabs stayed responsive

`NativeTabs` / `UITabBar` (or Android equivalent) handles tab switches on the **native** side. They do not need the JS thread to complete the PIN parse.

## Why feature taps queued FIFO

JS event loop backlog: `onPress` callbacks and `router.push` run only when the thread is free, in arrival order. There was **no** app-owned action queue replaying commands.

## Why once per authenticated session

`lookupPromise` is a process singleton. First warm pays the cost; later opens reuse the cache until process death. Relogin in the same Metro/Expo Go process often stays warm; cold process after kill reproduces.

## Letterhead migration — causal?

**No — independent defect.** Migration was scheduled fire-and-forget after boot settled via `isFirebaseConfigured()` (true whenever web config is bundled), so Expo Go `local-mock` still called Firestore → `permission-denied`. Navigation did not await it. Fixed by backend gate + versioned idempotent policy.

## Why `lastActiveAt` ran twice

`AuthProvider` signed-in effect + React Strict Mode / overlapping `runAfterInteractions` could invoke `touchLastActive` twice before either write updated the throttle baseline. Fixed with synchronous `claimSessionLastActiveTouch` (in-flight + throttle).

---

## Permanent fix

1. **Remove** Calendar-tab PIN warm; policy `shouldWarmIndiaPincodeOnCalendarTabMount() === false`. Warm only when **Map mode** opens (`useCalendarMapsData`) or a form resolves a PIN.
2. **Letterhead migration:** skip `local-mock`; require Firebase config + storage; versioned AsyncStorage completion flag; never mark success on `permission-denied`; never gate navigation.
3. **`lastActiveAt`:** idempotent session claim; clear on logout.
4. Guarded `__DEV__` diagnostics behind `EXPO_PUBLIC_DEBUG_FIRST_ACTION_FREEZE=1`.

---

## Affected files

- `app/(app)/(tabs)/calendar.tsx`
- `src/services/location/pincodeOfflineLookup.ts` (+ test)
- `src/hooks/useCalendarMapsData.ts` (comment)
- `src/services/letterhead/letterheadStorageMigration.ts`
- `src/services/letterhead/letterheadMigrationPolicy.ts` (+ test)
- `src/services/auth/sessionLastActiveTouch.ts` (+ test)
- `src/state/auth.tsx`
- `src/state/sync.tsx`
- `src/diagnostics/firstActionFreezeDiag.ts`
- `src/diagnostics/firstActionFreeze.regression.test.ts`
- `package.json` (test scripts)
- `DEBUG_FIRST_ACTION_FREEZE_REPORT.md` (this file)

**Not modified:** `src/i18n/i18n.ts`, `src/i18n/validateLocales.ts`, `.expo-export-audit/`, `.env`

---

## Regression protections

- `npm run test:pincode-warm-policy`
- `npm run test:session-last-active`
- `npm run test:letterhead-migration-policy`
- `npm run test:first-action-freeze` (dashboard ready ≠ migration/PIN complete)

---

## Commands / automated results

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |
| `npm run test:pincode-warm-policy` | **PASS** |
| `npm run test:session-last-active` | **PASS** |
| `npm run test:letterhead-migration-policy` | **PASS** |
| `npm run test:first-action-freeze` | **PASS** |
| `npm run test:sync-lock-identity` | **PASS** |
| `npm run test:root-providers` | **PASS** |
| `npm run test:consent-dismiss` | **PASS** |
| `npm run test:curtain-phases` | **PASS** |
| `npx expo export --platform ios --output-dir /tmp/vyaamikk-freeze-export-check` | **PASS** (HBC bundle written) |

Lint: `npm run lint` ≡ `typecheck` (PASS).

Manual device matrix: **pending operator** on Expo Go / device (see table above).

Firebase / external deployment: **not required** for this fix.

---

## Manual device matrix (operator)

| Scenario | Expected |
|----------|----------|
| Fresh login → immediate Add New Record | Picker &lt;300 ms |
| Fresh login → Saved Records / Logout | Immediate |
| Onboarding complete → feature tap | Immediate |
| Logout → fresh login | Immediate (or warm if process cached PIN — still no freeze from Calendar mount) |
| local-mock | No letterhead Firebase; no double `lastActiveAt` |
| Switch all tabs then feature tap | Immediate; PIN warm only if Map opened |
| Wait 20 s then feature tap | Immediate |
| Rapid multi-feature taps | No delayed FIFO batch from PIN parse |
| AppState bg/fg around login | No stuck lock |
| Open Calendar → Map | PIN warm may take seconds **only then**; rest of app should remain usable |

---

## Expo Go / device-build limitations

- Expo Go still ships Firebase web config; migration must stay backend-gated (done).
- First **Map** open or first form PIN resolve may still cost multi-second JS parse — scoped to that feature, not post-login dashboard.
- Full press→nav &lt;300 ms acceptance requires operator device confirmation after this fix.

---

## Follow-up risks

- If product wants instant Map PIN markers, consider a worker / prebuilt index — out of scope here.
- Do not reintroduce tab-mount PIN warm.
