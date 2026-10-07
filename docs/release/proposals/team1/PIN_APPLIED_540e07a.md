# Helper pin applied — application `540e07a`

Coordinator apply. Not a live Functions grant. Not A3 execute.

| Item | Value |
|---|---|
| **Application SHA** | `540e07aa07f376716484adb879ce66cb9fb170ce` |
| **CI-tested checkout** | `7e0d629023198333ed384ae076285925e98047d6` |
| Checkout parent | `d4c7ed4cb49d1bb5547fe3738702016bd1bcc36f` |
| Application parent | `573b208fcbf1029c2894c3f2e22b0e3acbadd122` |
| merge-base `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |
| GHA | **`37445383607` SUCCESS**, job **`112208918347` `verify`** |
| `540e07a`..`7e0d629` on `DEPLOYMENT_PATHS` | **empty** (docs/QA only) |
| T5 | `REVIEW_540e07a.md` `b3b1c97` SOURCE+INJECTED **PASS** |
| Helper `PINNED_APP_SHA` | **`540e07a`** (was `520f9f9`) |
| **Tooling SHA** | `2d33f6d252d66a89d6fcef5cf75feaf268e7e7b2` (helper pin constant only) |
| Ops-guard after apply | **34/34** TOOLING. Live mode still rejects `GRIN_OPS_PINNED_SHA`. UNKNOWN inventory still refuses mutate. |
| Historical ops-guard | `228a8f5` **34/34** — not byte-identical |

Supersedes unapplied `PIN_UPDATE_AFTER_fcda7cd.diff.md` / `313025f` / `56f2040`.
Do **not** pin those intermediates. Do **not** rebuild them.

`GRIN_OPS_ALLOW_LIVE` remains unset. This file is **not** authorization for
gate-off-initial, enable/disable, Rules, admission, EAS, or Play.
