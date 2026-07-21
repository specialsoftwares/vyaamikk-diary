# Email OTP Security Model

## Protected assets

- Verified email ↔ mobile ↔ account binding
- OTP secrets / digests / challenge state
- Recovery answers (digested only)
- Security event history
- Cooling-off high-risk gates

## Trust boundaries

| Component | Trust |
|-----------|--------|
| Expo client | Untrusted for verification/binding |
| Callable Functions + Admin SDK | Trusted |
| Firestore Rules | Deny client writes to bindings/challenges/verified flags |
| Email provider | Trusted for delivery; compromise → OTP interception risk |

## OTP design

- 6-digit CSPRNG (`randomInt`)
- 15-minute TTL; resend ≥30s; max 3 tries → 1h lock
- HMAC-SHA256(`EMAIL_OTP_HMAC_SECRET`, `challengeId|uid|email|version|code`)
- Digests cleared on consume/supersede/lock
- Timing-safe compare

## Abuse controls

Per-UID hourly sends, per-email hourly sends, distinct emails/day, challenge attempts, resend cooldown, concurrent supersede.

## Uniqueness races

Binding claim inside Firestore transaction after OTP success; `EMAIL_ALREADY_BOUND` privacy-safe message.

## Recovery residual risk

Questions derived from private profile fields; weak history → manual support (no lowered threshold). Single wrong answer fails entire attempt (no per-question hint).

## Session revocation limitation

Firebase cannot keep one old refresh token while revoking others. Design: revoke all → mint custom token for recovery device only.

## Cooling-off

Server `coolingOffUntil` (24h). Client displays only; callables/settings must re-check. Ordinary record use allowed; identity high-risk blocked.

## Remaining risks

- Email provider compromise / SIM swap of recovery email
- App Check not yet enforced (spoofed callables until rollout)
- Legacy FNV emailIndex rows may need admin merge
- Resend not configured → production send fails closed
