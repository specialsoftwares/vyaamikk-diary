# AUTH DEVICE SESSION MODEL

## Multiple phones

A normal login on another phone does not revoke older Firebase sessions or their session metadata. Signing out every device is the confirmed `logoutAllDevices` action. The “This wasn’t me” link records a report and does not sign a device out.

## Implementation today

| Piece | Status |
|-------|--------|
| `deviceInstallationId` (SecureStore) | Present |
| `trustedDevices/{id}` registry | Present (record/touch) |
| Account-wide token revoke on recovery | Present (`revokeRefreshTokens`) |
| Immediate revoke of prior devices on new login | Not done. A new login leaves older sessions in place. |
| New-device security email + 10s gate | EXTERNALLY BLOCKED (provider + functions) |
| Signed “This wasn’t me” | EXTERNALLY BLOCKED |
| Same-phone reinstall recognition | Best-effort via installation id |

## Honest limitation

Best-effort same-physical-device recognition **cannot be guaranteed** after reinstall, SecureStore loss, factory reset, or OS reset. When uncertain, treat as a **new device** (`classifyPhysicalDeviceRecognition`).

## Offline

- Full offline mutations: ≤24h after last successful online validation.
- After 24h: read-only existing local records.
- Always block offline: mobile/email change, recovery, deletion, export, bulk share, security settings. Signing out this device still works offline. Signing out every device needs a network to revoke other phones.
