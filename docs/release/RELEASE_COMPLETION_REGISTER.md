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
| Tooling suite | `node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` **34/34** (TOOLING, not application CI) |
| Merge-base / `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |
| `git diff` application pin | empty on `functions src eas.json app.json app firebase.json` |
| version | **1.0.0** / versionCode **23 unreserved** |
| firebase-tools | **14.20.0** |
| gcloud | **ABSENT** on this workstation (required on apply host for enable/disable) |
| eas CLI | **present** (`eas-cli/24.10.0`); no `internal-grin` or `5d5df3d` Android builds; highest EAS versionCode **22** |
| gh | not authenticated (git push of #31 still succeeded) |

Do not reopen ops-guard A/B without a new concrete reproduction.

---

## Readiness

| Gate | State |
|---|---|
| SOURCE | Candidate at `5d5df3d` + canonical CI. Wave 2 not accepted. |
| BACKEND PILOT | Prepared; **not authorized**; GRIN seven **ABSENT** on live |
| INTERNAL BUILD | Prepared; **not authorized**; versionCode 23 not reserved |
| DEVICE | Execution sheet ready; **NOT RUN** |
| BILLING | Source fail-closed; live handlers **present**; enablement **unknown**; purchases **off** |
| PUBLIC SUBMISSION | Blocked on policy + device + billing + listing |
| PUBLIC ROLLOUT | Not authorized |

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
| 2 Policy | Owner decision sheet; inspect deletion/quota (GRIN prefix **not** in purge list) | Written owner choices before public evidence |
| 3 Build/device | Profile freeze, Packet B, device sheet | EAS/native build; Play upload (separate) |
| 4 Billing/Play | Source trace, Packet C, listing worksheet | Product/price/activation/submission |
| 5 QA | Independent SOURCE review `RELEASE_COMPLETION_QA.md` (34/34 tooling re-run; public deletion **FAIL**) | Does not own implementation |

---

## Owner decisions still blank

See `docs/release/packets/OWNER_POLICY_DECISION_SHEET.md`.

| Topic | Owner choice | Blocks |
|---|---|---|
| GRIN pricing | **not recorded** | Public GRIN; Packet E for whichever plan customers pay through |
| Storage quota | **not recorded** | Public GRIN upload (or written residual-cost acceptance) |
| Retention/deletion | **not recorded** | Public release; production admission that accumulates customer originals |

Internal Testing may use **synthetic** evidence only while retention is unset.

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
