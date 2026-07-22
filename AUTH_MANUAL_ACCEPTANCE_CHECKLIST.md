# AUTH MANUAL ACCEPTANCE CHECKLIST

## Environments

- [ ] Expo Go local-mock (`EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP=1` + `EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP=1`)
- [ ] Production-like Firebase development build
- [ ] iOS device
- [ ] Android device

## Journeys

- [ ] New user Individual → dashboard
- [ ] New user Business → dashboard
- [ ] Existing complete user ≤5s Login successful → interactive dashboard
- [ ] Incomplete user resumes first gap; Back to mobile; forward again
- [ ] Mobile send failure preserves number/card
- [ ] Wrong OTP / lock / expiry / resend
- [ ] App close/reopen during valid mobile OTP
- [ ] Email send failure + Retry
- [ ] Profile image failure (when image required ships)
- [ ] Final submission failure Retry without OTP
- [ ] New-device security email failure (when deployed)
- [ ] Root/jailbreak block (when SDK wired)
- [ ] Offline 24h → read-only
- [ ] Revoked device unsynced quarantine

## Observed timings

| Step | Target | Observed |
|------|--------|----------|
| Button → handler | immediate | _manual_ |
| Handler → nav | <300ms | _manual_ |
| Login readiness | ≤5s | _manual_ |

**Session note:** Automated unit/policy tests passed; physical-device matrix not executed in this Cursor session.
