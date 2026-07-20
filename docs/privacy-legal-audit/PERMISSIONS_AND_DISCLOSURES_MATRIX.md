# PERMISSIONS AND DISCLOSURES MATRIX

**Tip:** `f1019b6` · Sources: `app.json`, location/notification/image-picker code.

---

## Matrix

| Permission | Where requested | Preceding explanation | Optional? | If denied | App still usable? | Collection after purpose ends? | Prominent disclosure likely? | Confidence |
|------------|-----------------|----------------------|-----------|-----------|-------------------|-------------------------------|------------------------------|------------|
| **Foreground location** (iOS When-In-Use; Android FINE/COARSE) | After deferred consent host; `Location.requestForegroundPermissionsAsync` (`src/services/location.ts`) | Consent sheet + `NSLocationWhenInUseUsageDescription` / plugin strings in `app.json` | Yes | No GPS footprints; PIN/manual location still possible | Yes | Should stop capturing new GPS; existing footprints remain on saved records until user deletes records | Play: approximate/precise location — disclose if used | CODE VERIFIED |
| **Background location** | **Disabled** in plugin (`isIosBackgroundLocationEnabled: false`, Android false) | N/A | N/A | N/A | N/A | N/A | Must not claim background | CODE VERIFIED |
| **Notifications** | Before scheduling reminder; rationale modal required by service comments | In-app rationale then OS prompt (`notifications.ts`) | Yes | Reminders cannot schedule | Yes | No scheduling; cancel path exists | Disclose reminders (not marketing push) | CODE VERIFIED |
| **Camera** | Image picker when user attaches letterhead / cash-paid / customer photo | `NSCameraUsageDescription` + plugin `cameraPermission` | Yes | Cannot capture new photos; may still pick library | Yes | Only when user attaches | Photos disclosure | CODE VERIFIED |
| **Photo library** | Letterhead / attachments | `NSPhotoLibraryUsageDescription` + plugin | Yes | Cannot pick photos | Yes | User-driven | Photos | CODE VERIFIED |
| **Photo library add** | Saving exported PDFs if chosen | `NSPhotoLibraryAddUsageDescription` | Yes | Cannot save to library | Yes | User-driven | Photos | CONFIG VERIFIED string |
| **Microphone** | **Explicitly false** in image-picker plugin | N/A | N/A | N/A | N/A | N/A | Do not declare mic | CODE VERIFIED |
| **Internet / network** | Implicit | N/A | Required for cloud OTP/sync | Offline local use partially works | Partial | N/A | Standard | ASSUMED platform |

---

## Consent surfaces (non-OS)

| Surface | What | Evidence |
|---------|------|----------|
| Legal Terms + Privacy checkboxes | Affirmative before continuing auth | `LegalConsentCheckboxes`, `AuthFlowGate`, `legalConsentService` |
| Location footprint consent | Product consent before OS prompt | `DeferredLocationFootprintConsentHost`, preferences `vyd_location_footprints_v1_*` |
| Notification rationale | Before OS prompt | Documented in `notifications.ts` |

---

## Google Play policy notes (issue-spotting)

- Location: foreground-only; disclose Approximate/Precise as applicable; no background.
- Photos: user-generated content for business records — declare collection and ephemeral processing.
- Notifications: local reminders — declare; do **not** claim push messaging if tokens unused.
- Prominent disclosure: counsel/product to decide if in-app consent sheet + system strings suffice for Play “prominent disclosure” for location.

**Sources:** [Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311); location plugin config in `app.json`.
