# Firebase Auth SMS failure — sanitized diagnosis (no new SMS)

**Date:** 2026-10-07  
**Project:** `vyaamikk-diary` (`982505811909`)  
**Surface:** GRIN LIVE F local sign-in (`127.0.0.1` authorized domain)  
**Tooling SHA (send guards):** `20df6b99384f366ceddf4aa7680b5060cd664970`  
**Application pin (unchanged):** `540e07aa07f376716484adb879ce66cb9fb170ce`

This note reuses prior request evidence. **No new OTP / SMS was sent** for this diagnosis. Live Admin/Monitoring APIs were **not** re-queried successfully (OAuth token refresh failed: `invalid_client` / prior calls `UNAUTHENTICATED`).

---

## Established (evidence-backed)

| Item | Value | Evidence boundary |
|---|---|---|
| Client Auth code | `auth/too-many-requests` | Owner-visible status on local sign-in page after reCAPTCHA success |
| Backend RPC | `AuthenticationService.SendVerificationCode` | Prior Cloud Monitoring / Identity Toolkit inspection in session (HTTP status aggregated) |
| HTTP status | **400** | Same prior inspection; **not** connection `-102` |
| Related RPC | `GetRecaptchaParam` **200** | Prior inspection — reCAPTCHA param fetch succeeded; distinct from send |
| SMS region allowlist | **IN** only | Prior Identity Toolkit config read — **not** identified as the blocker (sends were attempted for an IN number path) |
| Harness at failure time | published `17b8a68` lacked `sendInFlight` / `throttled` | Source at that SHA; concurrent/repeat clicks not blocked in-session |

## Not established (do not infer)

- Which **specific** Firebase/Google limit was hit (per-phone, per-IP, per-project SMS quota, abuse, billing SMS allotment, etc.) → **UNKNOWN**
- That nine `SendVerificationCode` HTTP 400s = nine user clicks, or that SMS was delivered nine times → **not established** (5 `GetRecaptchaParam` 200 vs 9 send attempts shows accumulation, not click causation)
- Numeric SMS quota ceiling → **UNKNOWN** (Cloud Quotas API previously 403 / not enabled; no SMS-sent metric series available in prior pass)
- Provider retry-after / cooldown timestamp → **UNKNOWN** (not returned to the client as a usable retry time in the observed `auth/too-many-requests` surface)

## Configuration notes (read-only; no changes made)

- Phone Auth was previously confirmed enabled for the project.
- Authorized domain `127.0.0.1` was added earlier to clear `auth/captcha-check-failed`; subsequent failures were throttle, not captcha.
- This diagnosis did **not** disable reCAPTCHA, convert the owner number to a Firebase test number, rotate VPN/IP, mint Admin sessions, or expand IAM.

## Identified limit

**UNKNOWN.** Exact quota / abuse bucket name and remaining capacity were not available from reusable evidence or a successful live quotas read in this pass.

## Proposed remedy (only if later confirmed)

1. Owner submits the support case below (or Console → Auth → usage / Quotas) to identify the **named** limit and any project billing / SMS provider allotment issue.
2. After a **named** limit is confirmed, apply **only** that remedy (e.g. wait for documented reset, or an explicitly authorized quota/billing change). Do not invent a cooldown.
3. Next OTP attempt: one intentional harness restart to load tooling `20df6b9`, **one** manual Send with owner present; stop immediately if throttled again.

## Firebase support case (owner submit — not sent by agent)

**Subject:** Phone Auth `SendVerificationCode` returns HTTP 400 / client `auth/too-many-requests` after successful reCAPTCHA (project vyaamikk-diary)

**Body (sanitized):**

```
Project ID: vyaamikk-diary
Project number: 982505811909
Product: Firebase Authentication — Phone SMS
Client: Firebase JS SDK 10.14.1 (web), authorized domain 127.0.0.1
Observed client error: auth/too-many-requests
Observed backend: AuthenticationService.SendVerificationCode → HTTP 400
Related: AuthenticationService.GetRecaptchaParam → HTTP 200 (reCAPTCHA succeeded)
Approx window: 2026-10-06 (local evening IST); multiple SendVerificationCode failures in ~6h
SMS region config: allowlist IN
We are not asking to disable reCAPTCHA or to register a production number as a test number.
Please identify: (1) the exact quota/abuse limit name that triggered this,
(2) whether project billing / SMS allotment is involved,
(3) any documented reset time or Console path to confirm capacity,
(4) request IDs / timestamps if available on your side for the failed SendVerificationCode calls.
We cannot share phone numbers, OTPs, or ID tokens in this ticket.
```
