# Proposed Firestore release — billing details/history owner reads

Baseline: serving proposed-consent ruleset `baf47ef1-8784-4bd5-896a-3ea480b0285f`
(sha256 `d5127a7696118be13e73f328d5bc6dae975c903762a1e1661bfa507ced56c10d`),
identical to `docs/release/rules-compat/proposed-consent/firestore.rules` before
this additive patch.

Additive change only:

| Path | Client |
| --- | --- |
| `users/{uid}/subscription/billingDetails` | owner read; write denied |
| `users/{uid}/subscriptionBillingHistory/{eventId}` | owner read; write denied |

Preserved from the consent baseline: processingPurposes owner-read, GRIN
owner-read matchers, subscription status/usageCurrent owner-read, and all
prior denies. This file does **not** change Storage rules or invent status
denial repairs. Diagnose status denial separately from history/details.

Lifetime usage fields remain on `subscription/usageCurrent` (already
owner-readable). Client writes stay denied; Admin/trusted admission writes
are unaffected.

Proposed artifact sha256:

`64a57dbd38f5ee36d76ef8d912b17192d9668d0b4d9ab7f1b13e1f99d39b8bfa`

Local gate: `npm run test:billing-reads-rules-emulator`.

Do not deploy until Stream A checkout/restore verification and owner approval.
Root `storage.rules` stay undeployed.
