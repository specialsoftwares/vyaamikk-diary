# Vyaamikk Diary — Firebase Storage Security Model

## 1. Purpose

User-owned binary content (letterhead templates, Cash Paid receipt photos, future PDF backups) is stored in **Firebase Storage** under strict per-user paths. Firestore holds metadata and **`storagePath`** as the canonical reference — not long-lived public URLs.

## 2. UID-based isolation pattern

Every object path starts with `users/{userId}/…` where `userId` must equal `request.auth.uid` for read/write.

## 3. Path conventions

| Path | Use |
|------|-----|
| `users/{userId}/letterhead/{filename}` | Letterhead template image |
| `users/{userId}/attachments/{recordId}/{filename}` | Cash Paid receipt / record attachments |
| `users/{userId}/pdfs/{recordId}/{filename}` | Optional cloud PDF backup (rules ready; V1 app upload not enabled) |

## 4. Rule principle

From `storage.rules`:

- `request.auth != null`
- `request.auth.uid == userId` path segment
- Size limits: 10 MB images, 15 MB PDFs
- Content-type guards on write
- Default deny: `match /{allPaths=**} { allow read, write: if false; }`

## 5. No public buckets

- No `allow read: if true`
- No world-readable paths
- No cross-user reads or writes

## 6. Download URL handling

- **Store `storagePath` in Firestore** as canonical
- Optional cache: `downloadUrl`, `downloadUrlUpdatedAt`
- Resolve URLs at render/PDF time via Firebase Storage SDK: `getDownloadURL(ref(storagePath))`
- **Never** manually construct public HTTP URLs
- Token URLs are **not** permanent access-control objects — re-resolve when expired

## 7. Migration from Firestore base64

Letterhead previously stored `imageDataUri` inline (Firestore ~1 MB doc limit risk).

- New saves upload to Storage; inline base64 is removed
- `runLetterheadStorageMigrationForUser()` migrates legacy docs idempotently
- Read path: Storage → fallback to legacy base64 until migration completes

Cash Paid photos:

- Local preview URI for offline UX
- Firebase backends upload to `users/{uid}/attachments/{recordId}/…`
- Payload fields: `photoAttachmentStoragePath`, optional download URL cache

## 8. Future engineer checklist

- [ ] Deploy `storage.rules` with Firestore rules: `firebase deploy --only functions,firestore:rules,firestore:indexes,storage --project vyaamikk-diary`
- [ ] Confirm `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` is set in `.env`
- [ ] Never log download URLs or base64 in production
- [ ] Test cross-user access is denied (rules simulator)
- [ ] When adding new paths, update `storage.rules` and this doc

## 9. Deployment command

```bash
firebase deploy --only storage --project vyaamikk-diary
```

Combined with Firestore and Functions:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes,storage --project vyaamikk-diary
```
