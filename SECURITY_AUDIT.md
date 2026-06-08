# Vyaamikk Diary — Security & Privacy Audit Report

**Product:** Vyaamikk Diary (SPECIAL SOFTWARES / Ananya Engineered Industrial Components & Pay Systems LLP)  
**Stack:** React Native / Expo SDK ~54  
**Audit date:** 2026-05-31  
**Auditor role:** Release-readiness security review (no product/UI changes)

---

## 1. Executive Summary

| Verdict | **NOT READY FOR STORE REVIEW** |
|--------|--------------------------------|
| Internal dev / QA | **SAFE FOR INTERNAL TESTING ONLY** (mock OTP, optional open Firestore dev rules) |
| Closed beta | **READY FOR CLOSED BETA AFTER LISTED FIXES** only if production Firebase Auth + `firestore.rules` deployed and privacy URLs are real |

### Highest risks (must-fix before public release)

1. **Production phone OTP is not implemented** — `firebaseAuthService.startOtp` / `confirmOtp` throw; native verifier not wired (`src/services/auth/firebase.ts`).
2. **Shared-dev mode uses mock OTP `123456` and bypasses Firebase Auth** — if `firestore.rules.dev` is deployed to any shared project, **all data is world-readable/writable**.
3. **Placeholder legal URLs** — `EXPO_PUBLIC_PRIVACY_URL` / `TERMS_URL` default to `example.com` until replaced for store review.
4. **Firestore indexes** (`phoneIndex`, `ueidIndex`) are client-denied in prod rules but **writes still occur from client transactions** in shared-dev/prod paths — production should move resolve/create to **Admin SDK / Cloud Function** with rules `allow write: if false` on indexes (already false for clients; verify server path).

### What was fixed in this audit

- Centralized **HTML escaping** for all PDF templates.
- **Production config guard** blocks mock/local backends when `EXPO_PUBLIC_APP_MODE=production`.
- **Privacy-safe logger** with key/URI/HTML redaction.
- **Safe external URL** helper for Settings/About links.
- **`.env.example`**, **`.gitignore`**, **`firestore.rules`** hardening (letterhead + config subcollections).
- Settings/About use `openSafeExternalUrl` (http/https only).

---

## 2. Secrets Audit

### Scan method

Pattern search across repo (excluding `node_modules`, build dirs) for: `apiKey`, `SECRET`, `token`, `private_key`, `serviceAccount`, `123456`, Firebase keys, etc.

### Findings

| Location | Value | Classification | Action |
|----------|-------|----------------|--------|
| `src/services/auth/mock.ts`, `shared-dev.ts` | `MOCK_OTP = "123456"` | Test-only (dev backends) | OK in dev; **blocked in production** by `assertProductionConfig()` |
| `src/config/env.ts`, `.env.example` | `EXPO_PUBLIC_FIREBASE_*` empty placeholders | Public client config | Fill at build time; restrict API key in Google Cloud Console |
| `HANDOVER.md`, `README.md`, i18n | Documents mock OTP | Documentation | Not a credential leak |
| `src/utils/ueid.ts` | `0x12345678` FNV seed | Non-secret constant | Safe |
| No `.env` committed | — | — | Good |
| No `serviceAccount*.json`, `google-services.json`, plist in repo | — | — | Good |

### Rotation required

**None identified** — no real API keys, private keys, or service accounts found in git-tracked files. If a `.env` with real Firebase keys was ever committed historically, rotate Firebase web API key restrictions and review Firebase audit logs.

### `.gitignore` status

Includes: `.env`, `.env.local`, `.env*.local`, `.env.development`, `.env.production`, `*.pem`, `*.key`, `serviceAccount*.json`, `firebase-admin*.json`, `GoogleService-Info.plist`, `google-services.json`, `*.p8`, `*.p12`.

### `.env.example`

Updated with client Firebase placeholders and commented **server-only** vars (`DATABASE_URL`, `JWT_SECRET`, `FIREBASE_ADMIN_*`, `SMS_PROVIDER_API_KEY`, `SENTRY_AUTH_TOKEN`).

---

## 3. Vulnerabilities Found and Fixed

| Severity | File(s) | Issue | Fix |
|----------|---------|-------|-----|
| High | PDF templates (`businessEntryPdfTemplate.ts`, `diaryEntryPdfTemplate.ts`, `letterheadPdfService.ts`, `pdfLayout.ts`, `professionalPackPdfTemplate.ts`, `documentHistory/index.ts`) | Duplicate local `esc()` — risk of inconsistent escaping / HTML injection in printed PDFs | Shared `@/utils/escapeHtml` |
| High | `app/_layout.tsx` + `src/config/productionGuard.ts` | Production could fall back to mock auth / local storage | `assertProductionConfig()` throws if not `firebase-production` + full Firebase config |
| Medium | `app/(app)/(tabs)/settings.tsx`, `about.tsx` | `Linking.openURL` without scheme check | `openSafeExternalUrl` (http/https only) |
| Medium | `src/utils/logger.ts` | Potential PII in logs | Redaction + suppress debug/info in production |
| Low | `firestore.rules` | Missing subcollections | Added `letterheadDocs`, `config/{configId}` under `users/{uid}` |
| Low | `.gitignore` | Incomplete secret patterns | Expanded credential globs |

---

## 4. Vulnerabilities Remaining

| Severity | Issue | Why not fixed | Next step |
|----------|-------|---------------|-----------|
| **Critical** | Native Firebase Phone Auth not wired | Requires `@react-native-firebase/auth` or equivalent + EAS native config | Implement verifier; test iOS/Android; remove mock OTP from prod builds |
| **Critical** | `firestore.rules.dev` open read/write | Intentional for shared-dev without Auth | Never deploy to prod; use separate dev Firebase project |
| **High** | Shared-dev writes Firestore as deterministic uid without `request.auth` | Dev convenience | Prod must use `firestore.rules` + real Auth only |
| **High** | `phoneIndex` / `ueidIndex` client transactions | App writes indexes from client in resolve flow | Move to Cloud Function with Admin SDK; keep rules `allow write: if false` for clients |
| **Medium** | Placeholder privacy/terms URLs | Product/legal | Set real URLs in `.env` / EAS secrets before store submission |
| **Medium** | Letterhead image picker (setup) — no shared size/MIME guard like profile logo | Scope | Reuse `MAX_PROFILE_LOGO_BYTES` / `ALLOWED_MIME` pattern from `profileLogo/storage.ts` |
| **Low** | `expo-blur@14` vs SDK 54 expected `~15.0.8` | Non-security version skew | `npx expo install expo-blur@~15.0.8` |
| **Low** | npm audit: 14 moderate (postcss, uuid in Expo toolchain) | Transitive dev/build deps; fix forces Expo 56 | Track Expo SDK upgrades; not runtime app RCE in typical RN bundle |

---

## 5. Data Handling Review

| Data | Collected where | Stored | Optional? | PDF/export | Logged | Deletion |
|------|-----------------|--------|-----------|------------|--------|----------|
| Mobile (E.164) | Login OTP | Firestore `users`, `phoneIndex` (server index) | Required for account | No in PDF footer | Masked via logger | Soft-delete flow exists |
| UEID | Auth resolve | `users`, `ueidIndex` | System-assigned | No | Redacted keys | Preserved on soft-delete (by design) |
| Display / business name | Profile, composers | Firestore / AsyncStorage (mock) | Profile required for full use | Yes — escaped in PDF | Partial keys redacted | Profile update / account deletion |
| Logo | Settings identity | App document dir per uid | Optional | PDF if enabled in settings | URI redacted | Remove on save / delete account |
| Diary / business entries | Composers | `users/{uid}/entries` | User-created | PDF export | Body keys redacted | Soft-delete |
| Payment / bank fields | Payment request composer | Entry payload | **Optional** (Yes + fields) | PDF section only when opted in | bank/ifsc/upi redacted | With entry |
| Location | Entry composer | Entry geo fields | Optional | May appear in entry PDF | lat/lng redacted | With entry |
| Reminders | Entry reminder UI | Local notifications | Optional | N/A | Minimal | Cancel on entry delete (verify per entry type) |
| Letterhead | Letterhead flows | Firestore + local files | Optional | PDF | — | Per doc soft-delete |
| Professional packs | Pack composer | `professionalPacks` | Optional | PDF | — | Soft-delete |

**Concerns:** AsyncStorage in `local-mock` is **unencrypted at rest** on device — acceptable for dev only. Session uses **SecureStore** on native (`src/services/session.ts`).

**Bank details:** Validated only when user enables bank section (`paymentBankDetails.ts`); not forced into PDF unless Yes + content.

---

## 6. Firebase / Backend Security

| Mode | Backend | Auth | Data | Rules file |
|------|---------|------|------|------------|
| Dev, no Firebase | `local-mock` | Mock OTP | AsyncStorage | N/A |
| Dev + Firebase | `firebase-shared-dev` | Mock OTP | Firestore | Must use **`firestore.rules.dev`** (open) — dev project only |
| Prod + Firebase | `firebase-production` | **Intended** real OTP | Firestore | **`firestore.rules`** (owner-scoped) |

### Production rules (`firestore.rules`)

- Users: read/update own doc; `ueid` immutable on update; no hard delete.
- Subcollections: `entries`, `professionalPacks`, `letterheadDocs`, `config` — owner-scoped.
- `phoneIndex`, `ueidIndex`: **client read/write denied**.

**Gap:** Production release requires **Firebase Auth UID == Firestore path uid**. Shared-dev does not satisfy this — do not ship shared-dev to stores.

### Firebase Auth OTP

`firebase.ts` documents seams; `startOtp` logs error and throws `auth_not_configured`-class behavior until native verifier integrated.

---

## 7. Dependency Audit

### Commands run

```bash
npm run typecheck   # PASS
npm run lint        # PASS (alias to typecheck)
npx expo-doctor     # 17/18 — expo-blur version mismatch
npm audit           # 14 moderate (Expo/postcss/uuid transitive)
```

### `npm audit` summary

- **14 moderate** — `postcss` (<8.5.10), `uuid` (<11.1.1) via `@expo/config-plugins`, `@expo/metro-config`, `expo` CLI chain.
- `npm audit fix --force` would install **expo@56** (breaking) — do not run blindly on SDK 54.

### `expo-doctor`

- `expo-blur` found `14.0.3`, expected `~15.0.8` for SDK 54.

---

## 8. Logging / Privacy

- Central logger: `src/utils/logger.ts` — redacts sensitive keys, masks phone, redacts URIs/HTML blobs; suppresses debug/info in production.
- Auth services use `createLogger` — phone passed as `phone` key → masked/redacted.
- Remaining raw `console.warn`: i18n missing keys (`__DEV__` only), test file stdout.

**Recommendation:** Replace any future `console.log` in services with `createLogger`.

---

## 9. Permission Review

| Permission | Platform | Rationale | Status |
|------------|----------|-----------|--------|
| Location when in use | iOS + Android | Optional entry geo | OK — background disabled in `expo-location` plugin |
| Photo library | iOS | Letterhead + profile logo | OK — contextual pickers |
| Notifications | Both | Entry reminders | OK — plugin configured; request when user sets reminder |
| Internet | Implicit | API/Firestore | Required |

**Not requested:** Background location, camera (library-only picks), contacts, microphone.

---

## 10. Exact Files Changed (security pass)

| File | Change |
|------|--------|
| `src/utils/escapeHtml.ts` | Created shared escape utilities |
| `src/config/productionGuard.ts` | Production backend guard |
| `src/utils/safeUrl.ts` | Safe URL open helper |
| `src/utils/logger.ts` | Privacy-safe logging |
| `app/_layout.tsx` | `assertProductionConfig()` at bootstrap |
| `firestore.rules` | letterheadDocs + config paths |
| `.gitignore` | Secret/credential patterns |
| `.env.example` | Placeholders + server-only comments |
| `src/services/pdf/*.ts`, `documentHistory/index.ts` | `escapeHtml` migration |
| `app/(app)/(tabs)/settings.tsx`, `settings/about.tsx` | Safe external links |
| `SECURITY_AUDIT.md` | This report |

---

## 11. Configuration Hardening (reference)

```typescript
// src/config/productionGuard.ts
export function assertProductionConfig(): void {
  if (!env.isProduction) return;
  if (!isFirebaseConfigured()) {
    throw new Error("Production build requires EXPO_PUBLIC_FIREBASE_* configuration...");
  }
  if (getActiveBackend() !== "firebase-production") {
    throw new Error(`Production build cannot use backend "${getActiveBackend()}"...`);
  }
}
```

**EAS / release checklist**

1. `EXPO_PUBLIC_APP_MODE=production`
2. All `EXPO_PUBLIC_FIREBASE_*` set in EAS secrets
3. Deploy **`firestore.rules`** (not `.dev`) to production Firebase project
4. Enable Firebase Phone Auth + App Check (recommended)
5. Replace privacy/terms/support URLs
6. Wire native phone OTP verifier
7. Restrict Firebase API key to app bundle IDs / SHA fingerprints

---

## 12. Release Decision

| Stage | Decision |
|-------|----------|
| Store review (App Store / Play) | **NOT READY** |
| Internal QA with mock OTP | **SAFE FOR INTERNAL TESTING ONLY** |
| Closed beta (real OTP + prod rules + legal URLs) | **READY FOR CLOSED BETA AFTER LISTED FIXES** |

### Preconditions for **READY FOR STORE REVIEW**

- [ ] No hardcoded secrets in repo
- [ ] Production builds cannot use mock auth (`assertProductionConfig` — **done**)
- [ ] Real Firebase Phone Auth end-to-end
- [ ] `firestore.rules` deployed; dev rules never on prod project
- [ ] Privacy policy / terms URLs live
- [ ] `npm run typecheck` passes (**done**)
- [ ] Dependency/expo-doctor issues triaged or accepted with documented risk
- [ ] Account deletion tested against production backend
- [ ] PDF HTML escaping verified (**done** in code)

---

*Report generated as part of the security hardening pass. For implementation details see `HANDOVER.md` §14 (Firebase / OTP) and `.env.example`.*
