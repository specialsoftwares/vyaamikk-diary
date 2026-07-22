# AUTH STATE MACHINE AND ROUTE POLICY

## Concepts (must stay separate)

| Concept | Source of truth |
|---------|-----------------|
| Server account completion | Profile + bindings + `identityRouteState` |
| Session | Auth provider + `sessionStore` |
| Visible wizard step | `onboardingNavigationStore.currentStep` |
| Max authorized step | `maxAuthorizedWizardStep(user)` |
| Intent | `bootResolution` \| `continueForward` \| `reviewPreviousStep` |
| Challenges | Pending OTP docs / local-mock maps |
| Offline mode | `resolveOfflineAccessMode` |
| Recovery / cooling-off | Server fields + `coolingOffPolicy` |

## Logical journey

`boot → mobileEntry → mobileConfirm → mobileOtp → emailEntry → emailOtp → businessIdentity → ueid → intro → location → dashboard`

## Guard rules

1. Never enter dashboard until phone verified + email verified + onboarding complete (location consent included).
2. `reviewPreviousStep` must not be overwritten by boot redirects.
3. Compare current vs intended route before `replace`.
4. After first dashboard entry: clear wizard nav; no Back into OTP/registration.

## Mapping to `IdentityRouteState`

| IdentityRouteState | Typical wizard landing |
|--------------------|------------------------|
| unauthenticated | mobileEntry |
| phoneAuthenticatedEmailMissing | emailEntry |
| emailPendingVerification | emailOtp / emailEntry |
| emailVerifiedOnboardingIncomplete | businessIdentity+ |
| fullyReady | dashboard |
| recoveryPending / recoveryCoolingOff | recovery / limited app |
| accountDisabled | pending-deletion |
