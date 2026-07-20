# SDK AND PROCESSOR REGISTER

**Tip:** `f1019b6` · Active use traced via imports — listing in `package.json` alone is **not** proof of collection.

**Roles are provisional.** Do not treat this as a controller/processor legal determination.

---

## 1. Active infrastructure / SDKs (CODE VERIFIED usage)

| Provider / package | Feature in app | Data potentially transmitted | Why | Provisional role | In Privacy Policy? | Play Data Safety impact | Cross-border implication | Deletion propagation |
|--------------------|----------------|------------------------------|-----|-------------------|--------------------|-------------------------|--------------------------|----------------------|
| Google Firebase Auth (`@react-native-firebase/auth`) | Phone OTP | Phone number, OTP, Auth uid | Account security | Processor / infra (typical) | **Yes** | Personal info; phone; Auth | Google may process outside India — **EXTERNAL** | Auth user deletion **not found** in Functions |
| Firebase JS Auth bridge | Custom token session for Firestore/Storage | uid tokens | Rules `request.auth` | Same Google | Yes | Same | Same | Same |
| Cloud Firestore (`firebase`) | Profile + records sync | Business + personal fields | Product cloud sync | Processor / infra | Yes | Personal + financial-ish user content | **EXTERNAL** location | Subcollections purged; indexes updated |
| Firebase Storage | Letterhead, attachments, optional PDFs | Images/PDFs ≤ size caps in `storage.rules` | User uploads | Processor / infra | Yes | Photos / files | **EXTERNAL** | **Gap: no Storage purge in deletion Functions** |
| Cloud Functions (`@react-native-firebase/functions` + `functions/`) | Identity, email bind, deletion, mint token | Auth context + payloads | Server authority | Processor / infra | Yes | Same | Region code `asia-south1` in source — **not** full residency proof | Implements Firestore-side deletion |
| Expo modules (router, SQLite, SecureStore, FileSystem, Print, Sharing, ImagePicker, Location, Notifications, Font, …) | App platform | Mostly on-device; build-time Expo | Runtime | Mixed (Expo as build vendor) | Disclose Expo/EAS builds | Device storage; photos; location; notifications | EAS build cloud **EXTERNAL** | N/A for most |
| `@react-native-async-storage/async-storage` | Prefs/drafts | On-device | UX | On-device only | Mention device storage | Device/local | No | Device wipe / uninstall |
| `expo-secure-store` | Session | Profile JSON | Session | On-device encrypted store (OS) | Yes (session) | Device | No | Sign-out |
| `react-native-maps` | Calendar maps | Tile requests; local coords | Maps UI | Map SDK + tile hosts | Yes (location/maps) | Location | Tile CDN **EXTERNAL** | N/A |
| `india-pincode` (offline) | PIN resolve | On-device DB | Locality | On-device library | Optional disclose | N/A if offline only | No | N/A |
| Public HTTP `api.postalpincode.in` | PIN fallback | PIN query | Locality text | Independent third party (public API) | **Yes** | May be “other” web | India-oriented API; logs **EXTERNAL** | N/A |
| OS Share Sheet / Mail / Browser | Export & links | User-chosen content | User action | User-initiated sharing (not sale) | Yes distinguish | Disclose user-initiated sharing | Recipient systems | Cannot recall |
| Expo Notifications (local) | Reminders | Title/body on device | Reminders | On-device | Yes | Notifications permission | No push token found | Cancel on delete entry |

---

## 2. Present in ecosystem but not product analytics

| Item | Finding | Confidence |
|------|---------|------------|
| Sentry / Crashlytics / Amplitude / Mixpanel / Segment / AppsFlyer | No product wiring found in app source for analytics/crash suites | CODE VERIFIED absence (search) |
| Firebase Analytics | Not evidenced as configured product dependency usage | ASSUMED unused unless Console enables — **EXTERNAL** |
| Push notification tokens (FCM/Expo push) | Explicitly not used in `src/services/notifications.ts` | CODE VERIFIED |

---

## 3. Website / email / future media

| Service | Status | Notes |
|---------|--------|-------|
| Lovable-hosted site `vyaamikk.specialsoftwares.com` | Live origin (mobile defaults) | Cookies/analytics **NOT verifiable** in this repo |
| Support mailbox | `support.vyd@specialsoftwares.com` (defaults) | Email processors (Google Workspace/etc.) **OWNER CONFIRM** |
| Grievance mailbox in code | `grievance@specialsoftwares.in` placeholder officer | Domain mismatch vs `.com` support — contradiction |
| Demo videos / CDN | Possible future | Must not claim in Cookie Policy until present |

---

## 4. Contracts / DPAs requiring external review

1. Google Cloud / Firebase terms + Data Processing terms.
2. Expo / EAS terms.
3. Any email delivery provider used by `functions` email verification.
4. Hosting/DNS for `specialsoftwares.com`.
5. Map tile provider terms (via `react-native-maps` platform defaults).

---

## 5. International processing (issue-spotting only)

- Functions region string `asia-south1` appears in `functions/src/deletion/lifecycle.ts` and related callables — **CONFIG/CODE VERIFIED as region setting**, not a guarantee that all Google subprocessors remain in India.
- Do **not** state “data never leaves India” without Google + counsel confirmation.
