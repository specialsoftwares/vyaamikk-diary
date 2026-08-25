# Vyaamikk identity contact invariants

These rules are permanent. Future code must preserve the distinctions.

## Availability is UEID assignment

A phone number or email is unavailable because it is authoritatively assigned to a Vyaamikk UEID — not merely because it was previously entered, OTP-verified, or replaced during onboarding.

Entered, OTP sent, OTP verified, temporarily used during onboarding, or previously replaced during Review are **not** the same as assignment.

Authority:

normalized mobile / email → Vyaamikk server availability check → AVAILABLE or ALREADY ASSIGNED.

The client must never decide uniqueness from local state alone.

## Signup Review edit limit

Signup Review permits up to two successfully completed mobile changes and up to two successfully completed email changes before onboarding completion.

- `mobileReviewChangeCount` max 2
- `emailReviewChangeCount` max 2
- Independent counters
- Original entry is not an edit
- Increment only after eligible + OTP verified + authoritatively bound
- Cancel, malformed input, collision, OTP failure, network failure, and bind failure do not consume a change
- Counters persist on the user profile for this onboarding Review lifecycle (survive remount / Back / process death)

The Review edit counter is not contact ownership. A replaced number/email remains reusable if no UEID currently owns it.

## Collision

If the normalized contact is assigned to a **different** UEID/account, refuse with privacy-safe copy. Do not reveal another user's name, UEID, or metadata.

Current-self ownership is valid. Unchanged already-verified contacts must not re-send OTP.

## Bind transaction

Precheck available → OTP verify → final server transactional check → bind to the **same** UID/UEID.

Review contact edit must never create another Vyaamikk identity.

During incomplete onboarding, releasing a replaced mobile does not start the 21-day recovery quarantine. After profile completion, that recovery reservation may apply; it must not masquerade as permanent UEID ownership. The former owner may reclaim a quarantined number.

## Resolver vs leftover quarantine

`resolveOrCreateUserByPhone` classifies by `phoneIndex` (UEID assignment), not by `mobileQuarantines`.

- Assigned to the authenticated caller → login. Do not reject because a quarantine marker exists.
- Assigned to another identity → privacy-safe conflict. Do not create a second UEID.
- Unassigned → eligible signup. Cancel leftover quarantine in the same transaction.

Entered, OTP-verified, replaced during Review, or left in an onboarding/contact-change quarantine row is not assignment. Quarantine remains a recovery marker; it must not block first signup of an unassigned number.
