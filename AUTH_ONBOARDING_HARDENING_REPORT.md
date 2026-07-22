# AUTH ONBOARDING HARDENING REPORT

**Date:** 2026-07-23  
**Tracker:** `MASTER_AUTH_ONBOARDING_EXECUTION_TRACKER.md`

## Previous defects / root causes

1. **Business-identity Back trap** — AuthFlowGate auto-handoff on verified email (`f812352` fixed with wizard intent).
2. **Email mock OTP `246810` vs expected `000000`** — aligned in `d58dc52`.
3. **Mobile mock OTP `123456` + UI hint** — leaked development codes; not purpose-bound/rate-limited.
4. **Phone input auto-stripped formatting** — violated reject-don’t-clean policy.
5. **Mobile OTP UI timers** — independent 30s decrement; no authoritative expiry/lock UX.
6. **Development OTP banners** — forbidden on product surfaces (now suppressed).
7. **Email syntax auto-trim** — now rejects illegal whitespace without silent trim on validate.

## Source work completed this pass

| Area | Status |
|------|--------|
| Mobile validation reject-not-clean | Done |
| Local-mock mobile OTP `000000` + flag | Done |
| Mobile TTL 10m / resend 30s / 3 attempts / 15m lock / 5/hour | Done (local-mock) |
| Hide OTP from UI | Done (mobile + email) |
| Authoritative mobile OTP timers + auto-submit once | Done |
| Secure digit snapshot | Done |
| Offline 24h policy module | Done (policy; not fully wired into every mutation gate) |
| Quarantine 21d policy module | Done (policy; server quarantine docs partial) |
| Device integrity fail-closed abstraction | Done (SDK not installed — EXTERNALLY BLOCKED) |
| Physical-device recognition honesty | Done |
| Email whitespace rejection | Done |
| Reversible wizard | Prior `f812352` |
| Email OTP HMAC/bindings | Prior `83fa1d3` |
| Recovery + cooling-off | Prior `81f8ae6` |

## Pass 2 source work (2026-07-23 continuation)

| Area | Status |
|------|--------|
| Individual/Business identity + review + atomic complete | Done (runtime + tests) |
| PIN confirm + stale protection + mandatory media | Done |
| GSTIN optional with honest verificationUnavailable | Done (no official provider) |
| Draft v2 autosave (uid/env/kind/schema) | Done |
| Email navigate-first / send-in-background machine | Done |
| Central offline capability guard on save/pdf/share/sync | Done |
| Server mobile quarantine + rebind (source + unit tests) | Done; deploy/TTL EXTERNALLY BLOCKED |
| New-device security events + wasn't-me tokens (source) | Done; email provider deploy EXTERNALLY BLOCKED |
| Issuer identity snapshot + per-PDF disclosure helper | Done |
| Legacy profile remediation routing | Done |
| Integrity test adapter (still fail-closed in prod) | Done; SDK EXTERNALLY BLOCKED |

## Explicitly not production-ready claims

- SMS provider / Resend production delivery
- App Check enforcement
- Functions/rules deployed
- Root/jailbreak SDK reliability
- Full single-device revoke + security-email gate end-to-end
- Profile review / mandatory PIN+image/logo / GSTIN official verify
- Emulator suite + physical device matrix (not run in this session)

## Flags for local-mock Expo Go

```bash
EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP=1
EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP=1
```

OTP values (docs only, never shown in UI): mobile `000000`, email `000000`.
