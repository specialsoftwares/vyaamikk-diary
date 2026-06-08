# Legal Compliance Gaps — Vyaamikk Diary

Last updated: 2026-06-04 (Phase 2 wiring)

## Resolved in Phase 2 (code)

| Item | Fix |
|------|-----|
| Implicit onboarding consent | Affirmative checkboxes in `LegalConsentCheckboxes` + `AuthFlowGate` |
| Consent logging | `legalConsentService.ts` → `UserProfile.legalConsents` |
| In-app legal viewing | `/legal/[doc]`, `/settings/legal` |
| Delete Account visibility | Moved under Account & App section; title "Delete Account & Data" |
| Production CF deletion | `firebaseServerDeletion.ts` calls `completeAccountDeletion` in production |
| Camera purpose string | `app.json` NSCameraUsageDescription + image-picker plugin |
| Legal config centralization | `src/config/legal.ts` |
| Compliance audit script | `npm run audit:legal-compliance` |

## Remaining blockers before store submission

| # | Gap | Path / action |
|---|-----|----------------|
| 1 | Production OTP device QA | `nativePhoneAuth.ts`, EAS dev build |
| 2 | Firebase Functions + rules deploy | `functions/`, `firebase deploy` |
| 3 | Hosted legal pages live | Publish `docs/legal/*.md` to `vyaamikk.specialsoftwares.in` |
| 4 | Grievance Officer placeholders | `src/config/legal.ts` `LEGAL_GRIEVANCE_OFFICER` |
| 5 | Registered address placeholder | `src/config/legal.ts` `LEGAL_ENTITY_ADDRESS` |
| 6 | Email verification provider | `functions/src/email/verification.ts` |
| 7 | ta/te/gu human review | `src/i18n/locales/translationReviewStatus.json` |
| 8 | Counsel review of full policy text | `docs/legal/`, expand beyond in-app summary |
| 9 | Web deletion request form | `EXPO_PUBLIC_ACCOUNT_DELETION_URL` must be functional |
| 10 | `google-services.json` / plist | Native Firebase builds |

## Audit command

```bash
npm run audit:legal-compliance
```
