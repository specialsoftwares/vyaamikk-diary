# Unknown Edge Case Matrix

**Date:** 2026-07-15  
**Legend:** ✅ static OK · 🧪 automated test · 📱 Expo Go manual · 🔧 dev build · 🔥 emulator · 📵 real device · ❓ unverified

---

## Authentication & identity

| Workflow | Static | Test | Expo Go | Dev build | Notes |
|----------|--------|------|---------|-----------|-------|
| Mock OTP login (`123456`) | ✅ | 🧪 identity tests | 📱 | — | Default `local-mock` in Expo Go |
| Production phone OTP | ✅ wired | 🧪 native-phone-auth | ❌ | 🔧 **required** | Native `@react-native-firebase/auth` |
| JS auth bridge (Firestore rules) | ✅ | 🧪 js-auth-bridge | ❌ | 🔧 **required** | `mintClientAuthToken` + `signInWithCustomToken` |
| Email verification | ✅ | partial | ❌ | 🔧 | Production only |
| Account deletion | ✅ | 🧪 deletion | 📱 mock | 🔧 prod | |
| Deletion reactivation | ✅ | 🧪 reactivation-routing | ❌ | 🔧 **required** | Cloud Functions |
| Mobile change | ✅ | 🧪 identity.mobile | ❌ | 🔧 | Support flow in prod |
| Session revalidation | ✅ | — | 📱 partial | 🔧 | Permission errors in shared-dev |

## Onboarding & shell

| Workflow | Static | Test | Expo Go | Dev build | Notes |
|----------|--------|------|---------|-----------|-------|
| Boot animation gate | ✅ | — | 📱 | 📱 | 12s timeout guard |
| Intro splash | ✅ | — | ❓ | ❓ | |
| Location onboarding | ✅ | — | ❓ | 🔧 | Native permission |
| Native tabs navigation | ✅ | — | 📱 | 🔧 Liquid Glass | Expo Go ≠ native tab chrome |
| Language switch | ✅ | 🧪 i18n | 📱 | 📱 | Dev reload path |
| Theme / appearance | ✅ | — | 📱 | 📱 | `useTheme` segmented control |

## You dashboard

| Workflow | Static | Test | Expo Go | Dev build | Notes |
|----------|--------|------|---------|-----------|-------|
| Dashboard stats | ✅ | — | 📱 | ❓ | |
| Hero identity card flip | ✅ | — | ❓ | ❓ | `animatingRef` risk |
| New Record picker curtain | ✅ | — | ❓ | ❓ | `CurtainSheet` teardown risk |
| Global search | ✅ | — | ❓ | ❓ | |
| Swipe delete row | ✅ | — | ❓ | ❓ | |

## Calendar

| Workflow | Static | Test | Expo Go | Dev build | Notes |
|----------|--------|------|---------|-----------|-------|
| Day view / markers | ✅ | — | 📱 | ❓ | |
| Map mode transition | ✅ | — | ❓ | 🔧 | `expo-location` / maps |
| Location footprints | ✅ | — | ❌ | 🔧 | Native permission |
| Pincode warm | ✅ | — | 📱 | 📱 | Network |

## Saved Records

| Workflow | Static | Test | Expo Go | Dev build | Notes |
|----------|--------|------|---------|-----------|-------|
| List / filter | ✅ | — | 📱 | ❓ | |
| Record detail | ✅ | — | 📱 | ❓ | |
| PDF export/share | ✅ | 🧪 pdf-* | 📱 partial | ❓ | iOS share hang class |
| Permanent delete | ✅ | 🧪 deletion | ❓ | ❓ | |

## Settings

| Workflow | Static | Test | Expo Go | Dev build | Notes |
|----------|--------|------|---------|-----------|-------|
| Identity edit | ✅ | — | ❓ | ❓ | |
| Language selector | ✅ | 🧪 i18n | 📱 | ❓ | |
| Appearance | ✅ | — | 📱 | ❓ | |
| Statutory tab link | ✅ | 🧪 statutory-dates | ❓ | ❓ | |
| Dev reset | ✅ | CLI tests | 📱 shared-dev only | ❌ | Blocked prod |
| Sign out | ✅ | — | 📱 | 🔧 prod | |

## Composers & record types

| Workflow | Static | Test | Expo Go | Dev build | Notes |
|----------|--------|------|---------|-----------|-------|
| Payment Request | ✅ | 🧪 save-* | ❓ | ❓ | |
| Cash Paid | ✅ | 🧪 cash-* | ❓ | 🔧 photo upload | Storage rules |
| Cash Paid photo | ✅ | — | ❌ | 🔧 | Firebase Storage |
| Dukaan / Customer Credit | ✅ | 🧪 customer-credit | ❓ | ❓ | |
| Purchase Order | ✅ | — | ❓ | ❓ | |
| Material Movement | ✅ | — | ❓ | ❓ | |
| Professional Brief | ✅ | 🧪 pro-pack | ❓ | ❓ | |
| Letterhead | ✅ | 🧪 letterhead-pdf | ❓ | 🔧 storage | |
| Save idempotency | ✅ | 🧪 save-* | ❌ | 🔧 | Firestore `_saveLocks` |
| Draft continuation | ✅ | 🧪 draft | ❓ | ❓ | |

## PDFs

| Workflow | Static | Test | Expo Go | Dev build | Notes |
|----------|--------|------|---------|-----------|-------|
| Human-readable filenames | ✅ | 🧪 pdf-file-names | 📱 | ❓ | |
| Cash Paid no denomination | ✅ | 🧪 | 📱 | ❓ | |
| Gujarati PDF labels | ✅ | 🧪 pdf-gujarati | ❓ | ❓ | |
| Share sheet cancel | ✅ | — | ❓ | 📱 iOS | Known hang |

## Infrastructure

| Workflow | Static | Test | Expo Go | Dev build | Notes |
|----------|--------|------|---------|-----------|-------|
| Firestore rules (prod) | ✅ | ❌ no suite | ❌ | 🔧 | Deploy blocked 401 |
| Storage rules | ✅ | — | ❌ | 🔧 | |
| Cloud Functions | ✅ | functions:build | ❌ | 🔧 | |
| App Check | ❌ absent | — | ❌ | ❌ | Not enabled |
| Crash reporting | ❌ absent | — | ❌ | ❌ | |
| Offline / reconnect sync | ✅ | — | ❓ | 🔧 | `SyncProvider` |
| Push notifications | ✅ dep | — | ❌ | 🔧 | Removed from Expo Go SDK 53+ |

---

## Summary counts

| Category | Count |
|----------|-------|
| Works by static inspection | ~45 flows |
| Covered by automated test | ~25 suites |
| Requires development build | ~15 flows |
| Unverified (❓) | ~30+ manual paths |

**Do not label ❓ flows as production-ready.**
