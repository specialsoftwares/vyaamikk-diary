# Secret scanning alert 1

Alert 1 is open. It is a Google API key. GitHub reports `validity: unknown` and `publicly_leaked: true`. The repository `specialsoftwares/vyaamikk-diary` is public. This page does not contain the value.

## Where it appears

The only secret-scanning location is commit `061902e6af0c54a6cc1877461c5f5c500cbca1c9`, file `src/startup/startup.coordinator.test.ts`, line 15. That commit is an ancestor of `origin/main` and of `integration`. Both public trees still contained the value when this page was written. The current `integration` source replaces the fixture. That replacement does not rewrite history, does not change `main`, and does not remove the public commit.

`google-services.json` and `.env` are gitignored. The local `google-services.json` Android client key is the same value as the alert. The gitignored `.env` value is a different key, the Firebase browser key `99f13a27-a2f4-43fa-a01e-a9c6ac51556f`, and it is not alert 1.

## What the live key is

The alert matches the API key named "Android key (auto created by Firebase)", uid `ecadc68f-37d0-40bd-b369-b68273d6554c`, in project `vyaamikk-diary` (`982505811909`). Created 2026-06-08. Updated 2026-08-08. It is the key installed Android clients use. It is not a synthetic test string.

API targets are restricted to a Firebase-shaped allowlist. That allowlist includes Identity Toolkit, Secure Token, Firestore, Firebase Storage, Cloud Datastore, Firebase Rules, Cloud Logging, SQL Admin, Play Integrity, and other Firebase APIs. There is no Android package restriction, no certificate restriction, no HTTP referrer restriction, and no server IP restriction. An API allowlist is not an application restriction. Possession of the key is enough to call every allowed API, subject to Firebase Security Rules and Auth for the data APIs.

Cloud Monitoring for the 30 days ending 2026-10-27, credential `apikey:ecadc68f-37d0-40bd-b369-b68273d6554c`, summed `serviceruntime.googleapis.com/api/request_count`:

| Service | Requests |
|---|---|
| Identity Toolkit | 120 |
| Firebase App Check | 194 |
| Secure Token | 60 |
| Firebase Installations | 44 |

Those calls are live client traffic. No other service on the allowlist had a request series in that window. Absence of SQL Admin traffic does not remove SQL Admin from the allowlist.

## Disposition

The alert stays **open**. It is not a false positive, not a test-only credential, and not revoked. `used_in_tests` would be the wrong resolution: the fixture copied a configured client key. Closing the alert because today's source no longer contains the string would hide a credential that still works.

This change does not revoke the key, does not rotate it, does not edit its API allowlist or application restrictions, and does not rotate `CONTENT_DATA_KEY`. Revocation would break the installed clients that produced the traffic above. Rotation needs a client release that ships a new key before the old one is disabled. That is a separate decision.

`CONTENT_DATA_KEY` is a different secret. It is still absent from Secret Manager. It was not created here.

Reading the key metadata required enabling `apikeys.googleapis.com` on `vyaamikk-diary`. That enablement does not change the key.
