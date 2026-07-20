# DATA FLOW AND STORAGE REGISTER

**Tip:** `f1019b6` · **Read-only audit** · Not a legal opinion.

---

## 1. Runtime architecture (data-relevant)

```
Device UI
  → LocalDb (SQLite) / AsyncStorage / SecureStore / FileSystem
  → SyncProvider + sync queue
  → Firebase JS SDK (Firestore, Storage, Auth bridge)
  → @react-native-firebase Auth (phone OTP) + Functions callables
  → Optional: api.postalpincode.in (PIN)
  → OS: share sheet, local notifications, Maps tiles (react-native-maps)
  → Browser: public HTTPS links / mailto support
```

Stable providers: `LocalDb → Auth → Sync` always mounted (`app/_layout.tsx`, commit `4a1a529`).

---

## 2. Persistence layers

| Layer | What | Path / key | Survives logout? | Survives account deletion? | Confidence |
|-------|------|------------|------------------|----------------------------|------------|
| SecureStore | Session profile | `vyd_session_v2` (+ legacy v1) | Cleared on sign-out (expected) | Should clear with session; **verify UX** | CODE VERIFIED key; logout wipe **CODE path in auth** |
| SQLite | Drafts, entries, sync_queue, active_route, pincode_cache, master_data, insights | `vyaamikk_diary.db` | User-scoped rows remain on device until purged/uninstall | **Cloud deletion does not auto-wipe device DB** (stated in `public-site/delete-account.html`; align with production UX) | CODE VERIFIED schema; device wipe behaviour **OWNER CONFIRM** |
| AsyncStorage | Language, theme, location prefs, drafts, retired phones local, etc. | `vyd_*` prefixes (`devReset/storageKeys.ts`) | Mixed (prefs vs user-scoped) | Local retired phones intentionally retained | CODE VERIFIED |
| App documents | Profile logo, cached media, generated PDFs | FileSystem URIs | Until cleared | Not automatically deleted by server | CODE VERIFIED patterns |
| Firebase Auth | Phone credential / uid | Google IdP | Session ends; Auth user may remain | **No `deleteUser` in Functions deletion code found** | CODE VERIFIED gap |
| Firestore | `users`, indexes, subcollections | See §3 | N/A | Pending → deleted/anonymized per lifecycle | CODE VERIFIED |
| Firebase Storage | letterhead / attachments / pdfs | `users/{uid}/…` | N/A | **No Storage purge in `functions/src/deletion/lifecycle.ts`** | CODE VERIFIED gap |
| Cloud Functions | asia-south1 callables + daily schedule | `functions/src` | N/A | Executes purge of Firestore subs + indexes | CODE VERIFIED |
| Expo/EAS | Build artifacts, project metadata | Expo cloud | N/A | Build logs retention **EXTERNAL** | CONFIG VERIFIED projectId only |

---

## 3. Firestore collections / paths (code + rules)

| Path | Role | Deletion handling | Confidence |
|------|------|-------------------|------------|
| `users/{uid}` | Profile | Status → deleted; fields anonymized in client helper; server sets deleted flags | CODE VERIFIED |
| `users/{uid}/entries` | Diary sync | Purged in Functions subcollection list | CODE VERIFIED |
| `users/{uid}/professionalPacks` | Packs | Purged | CODE VERIFIED |
| `users/{uid}/letterheadDocs` | Letterhead docs | Purged | CODE VERIFIED |
| `users/{uid}/purchaseOrders` | POs | Purged | CODE VERIFIED |
| `users/{uid}/customerCreditRecords` | Credit | Purged | CODE VERIFIED |
| `users/{uid}/config`, `counters`, `_saveLocks`, `trustedDevices` | Config / locks | Listed in Functions purge | CODE VERIFIED |
| `phoneIndex/{phone}` | Lookup | Deleted on retire; phone → `retiredPhones` | CODE VERIFIED |
| `ueidIndex/{ueid}` | Lookup | Marked retired | CODE VERIFIED |
| `emailIndex/{hash}` | Lookup | Marked deleted | CODE VERIFIED |
| `retiredPhones/{phone}` | Anti-reuse / audit | **Retained** after deletion | CODE VERIFIED |
| `deletionRequests` | Client deletion helper | Referenced in client firebase deletion | CODE VERIFIED client |

Rules file: `firestore.rules` (hardened commit noted in readiness docs). Live deployment status is operational history — treat production contents as **EXTERNAL VERIFICATION** for counsel timelines.

---

## 4. Transmission boundaries

| Boundary | Data | Why | User-initiated? | Confidence |
|----------|------|-----|-----------------|------------|
| App → Firebase Auth (native) | Phone E.164, OTP | Sign-in | Yes | CODE VERIFIED |
| App → Cloud Functions | Auth token, identity ops, deletion complete | Account lifecycle | Yes / scheduled | CODE VERIFIED `asia-south1` |
| App → Firestore | Profile + records | Sync / persistence | Implicit when cloud mode | CODE VERIFIED |
| App → Storage | Images/PDFs | Attachments | Yes on upload | CODE VERIFIED |
| App → postalpincode.in | PIN code | Resolve locality | On PIN lookup miss | CODE VERIFIED |
| App → OS Share / Print | PDF/bytes, share text | User export | Yes | CODE VERIFIED expo-sharing/print |
| App → mailto | Support email address only in URL | Contact | Yes | CODE VERIFIED |
| App → Safari/Chrome | Public HTTPS pages | Legal/support | Yes | CODE VERIFIED |
| Maps SDK | Map tile requests (provider network) | Calendar maps | When map shown | **EXTERNAL** tile provider privacy |
| SMS carriers | OTP SMS | Auth | Via Firebase | **EXTERNAL** |

---

## 5. Sync queue behaviour (privacy-relevant)

- Pending writes live in SQLite `sync_queue` + `entries_local.sync_status`.
- Session auth errors lock flush (`sessionSyncGate`); lock clears on identity change (`c54c8c9`).
- Logout during sync: must not leak cross-user — engine scopes by `user.uid` (**device QA still required**).

---

## 6. Facts requiring external confirmation

1. Firebase project data residency / multi-region replication for `vyaamikk-diary`.
2. Whether Firebase Auth phone users are deleted or disabled after account deletion.
3. Whether Storage objects under `users/{uid}` are purged by a job not in this repo.
4. Google Cloud logging / audit log retention.
5. Live Lovable website cookies, forms, and analytics.
6. Email verification provider (SendGrid/etc.) DPA and retention.
