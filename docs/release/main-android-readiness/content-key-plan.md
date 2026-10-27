# Account-setup content key

This plan is not a deployment and does not create a key.

## Call from main

A production profile write in `src/services/auth/firebase.ts` calls `protectBusinessCloud` for the `users` collection. `CONTENT_SEAL_WRITES_ENABLED` is true, and `shouldCreateContentSeals` is true only when the active backend is `firebase-production`. `protectBusinessCloud` then calls `callSealOwnerContent`, which invokes the callable `sealOwnerContent`.

The same callable protects diary entries, attachments, customer credit, purchase orders, professional packs, and letterhead documents. `openOwnerContent` is the matching read.

Both callables are declared in `functions/src/privacy/ownerContent.ts` for `asia-south1` and bind `CONTENT_DATA_KEY` from `functions/src/privacy/secrets.ts`. When `CONTENT_DATA_KEY_ID` is unset, the function uses that single key. `CONTENT_DATA_KEYS` is intentionally not bound.

## What is absent

`projects/982505811909/secrets/CONTENT_DATA_KEY` is not in Secret Manager. Cloud Run has no `sealownercontent` or `openownercontent` service. The client writes a `contentSeal` only after the callable returns, so this callable has not produced a production envelope.

That is a missing initial key, not a lost historical key. There is no secret version to rotate and no deployed function that could have sealed with one.

## Gate before any later provisioning

Count stored documents that already contain `contentSeal` without printing their fields. A zero count confirms the key would be the first one. A non-zero count means a historical key is missing: stop, and do not generate a replacement. A new key cannot open those envelopes.

Do not copy the emulator fixture `vyaamikk-emulator-content-key!!!` into Secret Manager.

## Compatible deployment, only after a separate authorization

1. Create secret `CONTENT_DATA_KEY` version 1 as a new 32-byte key, base64-encoded, with no prior version.
2. Grant `roles/secretmanager.secretAccessor` on that secret to `982505811909-compute@developer.gserviceaccount.com`.
3. Deploy `sealOwnerContent` and `openOwnerContent` from the reviewed `main` revision, region `asia-south1`, keeping the existing global CPU, concurrency, and max-instance settings.
4. Leave `CONTENT_DATA_KEY_ID` unset so writes stay on the single-key envelope.
5. Do not deploy Storage Rules, GRIN functions, or deletion functions as part of this key.

Until that separate authorization, account setup on a production build calls a function that is not deployed. The profile write fails closed at that call. Existing plaintext profiles stay readable because a document without `contentSeal` is not sent through `openOwnerContent`.
