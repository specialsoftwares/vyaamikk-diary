# Email OTP Deployment Checklist

## Environments

- [ ] Select Firebase project (`vyaamikk-diary` prod vs shared-dev)
- [ ] Confirm Functions region `asia-south1`

## Secrets (Firebase Secret Manager / Functions env)

- [ ] `EMAIL_OTP_HMAC_SECRET` (≥32 chars, unique per env)
- [ ] `EMAIL_PROVIDER_API_KEY` or `RESEND_API_KEY`
- [ ] `EMAIL_FROM_ADDRESS` (verified domain sender)
- [ ] Never put these in Expo `EXPO_PUBLIC_*` or git

## Email provider / DNS

- [ ] Create Resend (or chosen) account
- [ ] Verify sending domain (SPF/DKIM/DMARC)
- [ ] Send test message from Functions emulator with force-dev, then prod

## Deploy

- [ ] `firebase deploy --only firestore:rules`
- [ ] `firebase deploy --only firestore:indexes` (if composites added)
- [ ] `npm --prefix functions run build && firebase deploy --only functions`
- [ ] Configure Firestore TTL on `users/{uid}/securityEvents` field `expireAt` (90 days)
- [ ] Optional TTL on `emailOtpRateLimits.expireAt`

## App Check

- [ ] Register iOS/Android apps
- [ ] Debug tokens for Expo Go / emulators
- [ ] Roll out `enforceAppCheck` on email/recovery callables after clients ship tokens
- [ ] Do **not** treat Expo Go as proof of safety

## Client

- [ ] Production builds: no local-mock OTP path
- [ ] `EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP` unset in store builds
- [ ] Smoke: phone OTP → email OTP → onboarding → dashboard
- [ ] Smoke: legacy unverified email blocked at next login

## Reviewer

- [ ] Expo Go: local-mock OTP `246810` after phone auth
- [ ] Or pre-verify reviewer email via Admin for shared-dev/prod test project only

## Monitoring / rollback

- [ ] Alert on `EMAIL_PROVIDER_UNAVAILABLE` spike
- [ ] Alert on recovery_failed ≥2
- [ ] Rollback: redeploy previous Functions revision; rules remain deny-by-default for bindings

## Incident response

- [ ] Rotate `EMAIL_OTP_HMAC_SECRET` (invalidates outstanding challenges)
- [ ] Revoke refresh tokens for affected UIDs
- [ ] Notify verified emails via mandatory security template
