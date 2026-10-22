# Crypto custody decision — Option A approved

**Source checkpoint:** `06d3fcd42b2eaae1c057e1bf7461a088e208bfff`  
**Status:** APPROVED. The owner selected Option A. This is application-level encryption with restricted backend decryption. It is not end-to-end encryption, and it is not a claim that the company is technically incapable of decrypting.

Option B is not the implementation. The billing KMS key stays separate. The content key is the server secret `CONTENT_DATA_KEY`. It is not created in GCP by this source change.

Google Cloud default encryption (AES-256 at rest, as documented by Google) already applies to Firebase storage. An authorized Firestore or Admin SDK reader still receives plaintext. Masking an admin screen is not encryption. The accepted billing KMS control stays on its own key. It is not a personal-data key and was not re-tested here.

## Option A — controlled server decryption

Database and object readers see application ciphertext. One identified runtime role decrypts for approved product operations: showing a record, regenerating a local PDF, and restoring a confirmed record onto another phone after normal phone sign-in.

This matches the current product rules: several phones stay signed in, a replacement phone can restore cloud records, and loss of one phone does not by itself destroy readability. A project owner who can change IAM or deploy code remains inside the trust boundary. Call this envelope encryption, not end-to-end encryption.

Necessary server-readable metadata in either option: uid, phone index, verified-email binding, deletion generation and job state, consent receipts, quota counters, billing and tax records, and storage object names.

## Option B — user-held content keys

The app encrypts business content and original photos before upload. The server has no content key. Phone or email sign-in cannot recreate a key the company does not hold. Recovery requires a trusted device that already has the key, or a recovery secret the user holds. A sole lost phone with neither cannot restore readable content. Do not derive that secret from the phone number, OTP, DOB, or PIN. Do not store the plaintext recovery key on the server.

Option B conflicts with “a replacement phone restores confirmed records” unless the recovery method is chosen and built before any customer content is encrypted.

## Recommendation prepared for the owner, not applied

Prefer Option A for the stated scale (about 100 daily users), the multi-phone rule, and replacement-phone restore. Choose Option B only if the owner accepts that a lost phone without recovery material loses readable cloud content. Do not start migration, key creation, or customer re-encryption until one option is accepted.
