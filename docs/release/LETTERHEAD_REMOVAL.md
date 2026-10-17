# Letterhead removal

Owner decision, source only. Branch `remove/letterhead-feature`, taken from integration `209cb6974a45a21f1380e17ade0dcda323d84370`. Not a reset to `630655c` or `b5a9958`.

vc26 upload was rechecked on Internal draft 14. No bundle is attached. versionCode 26 is not available to testers. The existing AAB still contains Letterhead.

Maps unavailable in vc26; missing-key fallback test only.

No live Rules change, Functions deploy, data purge, billing change, EAS build, or Play upload was made. No SQLite migration was added. Historical migrations were not rewritten.

## Classification

**A. Removed (exclusive to creating or editing Letterhead)**

- New Record tile `letterhead_matter` and the route from the picker into the Letterhead gate.
- Screens that scanned, cropped, picked a template, generated a logo layout, edited a letter, previewed it, or generated a new PDF: `setup`, `generate`, and the old `create` / `index` editors.
- Document scanner, crop controller, image manipulator, template picker, candidate-file writer, and the preview components.
- Packages `@infinitered/react-native-mlkit-document-scanner` and `expo-image-manipulator`.
- Photo and camera permission copy that existed only to attach a new letterhead image.

**B. Preserved because another feature uses it**

- Diary, purchase order, professional-record, and GRIN PDFs, including `expo-print` and share.
- Image picker and camera access for the profile logo, cash-paid receipt photos, and customer photos.
- FileSystem, Storage upload, MIME checks on those uploads, and PDF/ZIP protections.
- VyaaFlow, Records, You, Settings, and Android Back.
- Business profile, logo, and sender fields outside Letterhead.

**C. Retained so old data still reads**

- `LetterheadDocument` and draft payload parsing. Discriminator `letterhead` / `letterhead_matter` stays.
- Owner-scoped list and read. A saved letter opens a text view. A draft opens the same way and is not discarded or reclassified.
- The reader and list publish only for the UID, session generation, and record id that started the request. A later account, a new login of the same account, or a different letter id masks the previous text immediately. A late file check, error, or share callback cannot paint or share the previous account's PDF. An operating-system share sheet that has already opened is not revoked. Row open and delete confirm use the same check. A delete that still belongs to the current row still proceeds.
- Share is offered only when the stored PDF file is still on the device. A missing PDF is described as missing. Nothing new is generated, and the current logo is not substituted.
- `saveWithPdf`, the Firestore repository write, mirror policy, and quota exemption stay in source so an already-started save and the rules tests still describe the old write. No screen calls them.
- Account-deletion and Storage path inventories still include Letterhead objects.
- Firestore and Storage rules were not edited. Cross-account denial stays the rules' job.
- SQLite keeps the existing `form_drafts` rows. No new migration and no database reset.

**D. Historical evidence**

- Earlier release notes, incident write-ups, and PDF fixture packets stay. Current ASO and the website handoff are marked so Letterhead is not submitted as a current claim.

## Read ownership

The production reader and saved-letter list publish through one session runtime. A request records the UID, session generation, and record id before its first await. Each later check reads `syncSessionOwnership.capture()` and `isCurrent` and reconciles that token with the authenticated UID. A session copied during the last React render cannot authorize another account's letter. The original admission is kept: a newer login does not adopt the old operation. A retired success, error, or file check is ignored. Share checks that identity again after the file-existence await and again after the share call returns. A sheet the operating system has already opened is not revoked.

The reader mask also takes the document or draft id on screen. A route change hides the previous letter before the identity effect runs. Share, row open, and delete confirm close over the identity that rendered them, so a later record in the runtime is not what an old callback acts on. Leaving the screen invalidates a file check that has not reached the share call.

The regression drives that screen adapter with a deferred file check. It is not a mounted device and not a phone. Same-owner reads, a present PDF, a missing PDF, and a cancelled share stay covered.

## Routes

`/(app)/letterhead`, `setup`, and `generate` redirect to the saved-letter list. `create` without an id does the same. `create` with `draftId`, `documentId`, or the old `editDocId` opens the read-only view. A composer link for `letterhead_matter` still hits the existing invalid-type screen, not an editor.

## Older clients

Installed builds through vc26 can still create Letterhead if that release is what is on the phone. This source does not reject their writes and does not change live Rules. Rejecting those writes would be a separate change.

## Next build

This branch is a new source candidate. It is not vc26. Do not assign a versionCode until Play is read again. Do not start EAS from this removal until that inventory and a separate build approval.
