# AUTH DEVICE SESSION MODEL

## Single active device (intent)

Only one physical device should hold the active authorized session. A successful login on a different install should revoke older sessions before completing new-device security notification.

## Implementation today

| Piece | Status |
|-------|--------|
| `deviceInstallationId` (SecureStore) | Present |
| `trustedDevices/{id}` registry | Present (record/touch) |
| Account-wide token revoke on recovery | Present (`revokeRefreshTokens`) |
| Immediate revoke of prior devices on new login | PARTIAL — needs callable orchestration |
| New-device security email + 10s gate | EXTERNALLY BLOCKED (provider + functions) |
| Signed “This wasn’t me” | EXTERNALLY BLOCKED |
| Same-phone reinstall recognition | Best-effort via installation id |

## Honest limitation

Best-effort same-physical-device recognition **cannot be guaranteed** after reinstall, SecureStore loss, factory reset, or OS reset. When uncertain, treat as a **new device** (`classifyPhysicalDeviceRecognition`).

## Offline

- Full offline mutations: ≤24h after last successful online validation.
- After 24h: read-only existing local records.
- Always block offline: mobile/email change, recovery, deletion, export, bulk share, security settings, logout (requires network).
