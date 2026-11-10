# Account-setup content key

This plan is not a deployment and does not create a key.

## Call from main

A production profile write in `src/services/auth/firebase.ts` calls `protectBusinessCloud` for the `users` collection. `CONTENT_SEAL_WRITES_ENABLED` is true, and `shouldCreateContentSeals` is true only when the active backend is `firebase-production`. `protectBusinessCloud` then calls `callSealOwnerContent`, which invokes the callable `sealOwnerContent`.

The same callable protects diary entries, attachments, customer credit, purchase orders, professional packs, and letterhead documents. `openOwnerContent` is the matching read.

Both callables are declared in `functions/src/privacy/ownerContent.ts` for `asia-south1` and bind `CONTENT_DATA_KEY` from `functions/src/privacy/secrets.ts`. When `CONTENT_DATA_KEY_ID` is unset, the function uses that single key. `CONTENT_DATA_KEYS` is intentionally not bound.

## What is absent today

`projects/982505811909/secrets/CONTENT_DATA_KEY` is not in Secret Manager. Cloud Run has no `sealownercontent` or `openownercontent` service. Those facts describe the project now. They do not prove that a deleted service, an older revision, or another writer never stored a `contentSeal`.

The current client writes `contentSeal` only after `sealOwnerContent` returns. That does not cover a historical deployment that returned envelopes and was later removed.

## Historical-encryption check

Initial provisioning stays conditional on this check. Do not create the key until the check has run and its result is a complete zero. This plan has not run the check and does not claim that no historical ciphertext exists.

Search the live documents in `users`, `entries`, `attachments`, `customerCreditRecords`, `purchaseOrders`, `professionalPacks`, and `letterheadDocs` for a `contentSeal` field. Count matches. Do not print document bodies, account ids, or ciphertext.

Scope and limits of that count:

- A missing secret or a missing Cloud Run service is not a zero count.
- A query error, a missing index, or a timed-out scan is not a zero count. Stop.
- Sampling is not a full count.
- The count does not see deleted documents, backups, exports, or Storage objects.
- On-device encrypted rows use the local account key. They are not evidence for or against this server secret.
- A non-zero count means a historical key is missing. Stop. A new key cannot open those envelopes.
- A complete zero count is the condition for treating a later key as the first one. There is still no secret version to rotate, because no secret exists today.

Do not copy the emulator fixture `vyaamikk-emulator-content-key!!!` into Secret Manager.

## Compatible deployment, only after a separate authorization

1. Only after the historical-encryption check returns a complete zero, create secret `CONTENT_DATA_KEY` version 1 as a new 32-byte key, base64-encoded, with no prior version.
2. Grant `roles/secretmanager.secretAccessor` on that secret to `982505811909-compute@developer.gserviceaccount.com`.
3. Deploy `sealOwnerContent` and `openOwnerContent` from the reviewed `main` revision, region `asia-south1`, keeping the existing global CPU, concurrency, and max-instance settings.
4. Leave `CONTENT_DATA_KEY_ID` unset so writes stay on the single-key envelope.
5. Do not deploy Storage Rules, GRIN functions, or deletion functions as part of this key.

Until that separate authorization, account setup on a production build calls a function that is not deployed. The profile write fails closed at that call. Existing plaintext profiles stay readable because a document without `contentSeal` is not sent through `openOwnerContent`.
