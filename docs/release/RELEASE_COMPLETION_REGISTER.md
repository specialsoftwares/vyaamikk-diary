# Release completion register — Internal GRIN / billing / public candidate

Coordinator register. Not authorization. Not a “bug-free” promise.
Target public availability **18 October 2026** is a delivery date, not a gate
bypass and not a Play-approval promise.

Wave 2 is **not** accepted. Encrypted PDF backup remains backlog.

Evidence labels: SOURCE / INJECTED / SQLITE_HOST / EMULATOR /
MOUNTED_INERT_NATIVE / NATIVE_DEVICE / PLAY_INSTALLED / LIVE_BACKEND /
TOOLING (ops-guard suite; not application CI).

---

## Coordinates (verified this session)

| Item | Value |
|---|---|
| Repo | `specialsoftwares/vyaamikk-diary` |
| Branch | `integration/grin-g1-g5-source` |
| Draft PR | #31 (no duplicate PR; auto-merge off) |
| **Application SHA** | `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` |
| Application CI | run **`37351685421`**, job **`111903806888`**, `ci:verify` success. Do not reuse `37344993645`. Do not cite this CI for later application changes. |
| **Operational tooling SHA** | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` |
| Docs checkpoint (Team 4 billing fold) | `aa5253e4e070195227055cde836d6b528d5e0070` |
| Tooling suite | `node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` **34/34** (TOOLING, not application CI) |
| Merge-base / `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |
| `git diff` application pin | empty on `functions src eas.json app.json app firebase.json` |
| version | **1.0.0** / versionCode **23 unreserved** |
| firebase-tools | **14.20.0** |
| gcloud | **ABSENT** on this workstation (required on apply host for enable/disable) |
| eas CLI | **present** on combined earlier as `eas-cli/24.10.0`; Team 3 this session used `npx eas-cli@16.28.0`. No `internal-grin` or `5d5df3d` Android builds; highest EAS versionCode **22**. Play inventory **NOT RUN** (Console ToS / aeadmin lockout) |
| gh | not authenticated (git push of #31 still succeeded) |

Do not reopen ops-guard A/B without a new concrete reproduction.

---

## Readiness

| Gate | State |
|---|---|
| SOURCE READY | Candidate at `5d5df3d` + canonical CI. Team 5: public deletion **FAIL**; issuance allowance **FAIL** public until Team 2. Wave 2 not accepted. |
| BACKEND PILOT READY | Prepared; **not authorized**; GRIN seven **ABSENT** on live |
| INTERNAL BUILD READY | Prepared; **not authorized**; Play inventory **NOT RUN**; versionCode 23 not reserved; no `internal-grin` / `5d5df3d` EAS AAB; B1≠B2 |
| DEVICE ACCEPTED | Execution sheet ready; **NOT RUN** |
| BILLING ACCEPTED | Source fail-closed; live handlers **present**; `PLAY_BILLING_ENABLED` absent; catalog **NOT RUN**; purchases **off** |
| PUBLIC SUBMISSION READY | Blocked on lifecycle implementation + economics confirm + device + billing + listing/disclosure |
| PUBLIC ROLLOUT APPROVED | Not authorized |

---

## Live preflight (refreshed 2026-10-06 this session)

Read-only `grin-functions-op.mjs inspect` (no mutation, no export overwrite).
Inventory **complete**: HTTP 200, `pages=1`, `reason=ok`.

| Check | Result |
|---|---|
| Project | `vyaamikk-diary` / `982505811909` (HTTP 200) |
| Bucket | `vyaamikk-diary.firebasestorage.app` belongs (HTTP 200) |
| GRIN seven | **ABSENT** (complete inventory; not an error/empty fixture) |
| Unrelated asia-south1 functions | **39** (identity/email/deletion/billing) |
| Runtime SA | `982505811909-compute@developer.gserviceaccount.com` **`roles/editor`** |
| Editor residual | Broad privilege **exists**. Not granting a delete role does not remove it. Do not change this shared account. |
| Firestore DB IAM | HTTP **501** unsupported/unknown |
| Firestore sha256 | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` = baseline |
| Storage sha256 | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` = baseline |
| Rollback bytes | `docs/release/rules-compat/live-export-2026-10-06/` |

Billing callables are among the 39. This session: those handlers are
**ACTIVE**; `PLAY_BILLING_ENABLED` **key absent** (fail-closed). Client
purchase-entry remains `"0"`. Play Console catalog **NOT RUN**.

---

## Workstreams

| Team | Authorized work this session | Approval still required |
|---|---|---|
| 1 Backend | Enable/disable method, Packet A, privilege proposal, auth/admission coverage | Live Functions/Rules/IAM/admission/enable |
| 2 Policy | Owner choices recorded; implementing issuance/storage/expiry/export in team worktree | Economics confirm; 180-day public policy; no live purge |
| 3 Build/device | Play inventory **NOT RUN** (ToS / aeadmin lockout). EAS: no `internal-grin` / no `5d5df3d`; highest vc22. Device sheet **NOT RUN**. B1≠B2, neither granted. | EAS/native build; Play upload (separate); Play Console re-read |
| 4 Billing/Play | Source trace, Packet C, listing worksheet | Product/price/activation/submission |
| 5 QA | Independent SOURCE review `POLICY_QA.md` + `RELEASE_COMPLETION_QA.md` continuation. Tooling 34/34. Public deletion **FAIL** (P8). Issuance allowance **FAIL** public (P3). Artwork hashes **PASS**. Team 2 code **not reviewed**. | Does not own implementation; re-review after Team 2 merge |

---

## Owner decisions (recorded 2026-10-06)

See `docs/release/packets/OWNER_POLICY_DECISION_SHEET.md`. Authorize **source
implementation and tests** only. Not live deploy / billing / Play publish.

| Topic | Owner choice | Residual hold |
|---|---|---|
| GRIN pricing | **A — include in existing Starter / Professional / Business.** No separate SKU. One new issuance consumes one monthly record allowance. | Packet E real-store acceptance before public commercial copy |
| Storage quota | **Proposed 1 / 5 / 20 GiB** per account, warn 80/95, refuse at cap, no silent delete. **Advertising blocked** until Team 2 economics. | Owner confirm allowances or the one alternative |
| Active / expiry | Keep issued evidence while entitled. After genuine expiry: 90-day read/export then 30-day notice. **No production purge job this assignment.** | Source state machine only until approved deploy |
| Explicit deletion | **Three facts, not one:** implemented **15 days**; owner requested **180 days**; public-approved policy **UNRESOLVED**. | Team 2+4 recommendation; do not advertise 180 |
| Export | Pack is summary (`originalsBundled=false`). Originals + record export required. ZIP optional. | Device proof NOT RUN |
| Testers | Owner + two trusted testers, separate accounts. Identities **not supplied**. | Owner UIDs/devices |

Internal Testing: **synthetic** GRIN evidence until lifecycle is implemented
and approved. Real customer GRIN evidence remains blocked until then.

---

## Next concrete approval

Offer **Approval A1 independently**: isolated **Firestore Rules** only
(`firebase.rules-only.json --only firestore:rules --project vyaamikk-diary`).
Does not depend on Functions helper execution. Not Storage, not Functions,
not enablement, not EAS, not billing.

Full packets: `APPROVAL_A_BACKEND_PILOT.md`, `APPROVAL_B_INTERNAL_BUILD.md`,
`APPROVAL_C_RESTRICTED_BILLING.md`, `APPROVAL_D_PUBLIC_SUBMISSION.md`.

Approval of one packet does not imply the others.

HOLD until written: main merge, live Functions/Rules/IAM/env writes, tester
admission, GRIN activation, EAS/native/OTA, Play upload/track/product,
billing activation, public rollout. `GRIN_OPS_ALLOW_LIVE=1` remains HOLD.
