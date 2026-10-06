# Controlled next Auth attempt (owner-present only)

**Do not Send OTP until the owner is present and agrees to one manual attempt.**

| Item | Value |
|---|---|
| Application pin | `540e07aa07f376716484adb879ce66cb9fb170ce` (frozen) |
| Tooling SHA required | `20df6b99384f366ceddf4aa7680b5060cd664970` |
| Provider retry time | **UNKNOWN** — restart does **not** clear Firebase throttle |
| Auto-retry | **Forbidden** |

## Why restart once

Published `17b8a68` lacked send guards. `20df6b9` adds `sendInFlight`,
`throttled` lock on `auth/too-many-requests`, generation cancel (no late
handoff), and `/session` `session_closed` after timeout.

**Old browser tabs keep old JS.** Keep **one** sign-in tab open after restart.

## Intentional restart (when owner is present)

```bash
cd /Users/shivamsaurav/vyd-worktrees/grin-combined
# ensure tooling SHA
git rev-parse HEAD   # expect 20df6b9 or successor containing the controller
# kill any stale :8787 listener if present (one intentional restart, not a loop)
export GRIN_OPS_ALLOW_LIVE=1 GRIN_PILOT_SMOKE_LIVE=1 GRIN_OPS_PATCH_PROVEN=1
export GRIN_LIVE_F_SIGNIN_TIMEOUT_MS=3600000
npx --yes tsx docs/release/packets/grin-ops/grin-live-f.ts
```

Open **only** `http://127.0.0.1:8787/` (fresh tab). Complete reCAPTCHA → **one** Send.

- If `auth/too-many-requests`: **stop**. Retain sanitized status. No second click.
- If OTP arrives: confirm once; harness continues authorized authenticated F
  (register / replay / upload-verify / confirm / narrow read+local-manifest).
  Do **not** relabel that check as production PDF export.
- Non-admitted / cross-owner LIVE remain **NOT RUN**.
