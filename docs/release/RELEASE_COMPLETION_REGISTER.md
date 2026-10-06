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
| **Application SHA** | `520f9f98bc952fd7f30a907da9e85774629a69c0` — S1/S2 storage accounting (cherry-pick of Team 2 `0cd3473` on `team/grin-t2-s1s2`). Pre-fix was `b845e8a`. |
| **PR / checkout HEAD** | This coordinator fold (scripts + register) on `integration/grin-g1-g5-source`, PR #31. Application blobs match `520f9f9`. |
| GitHub Actions canonical CI | **NOT YET** for `520f9f9`. Do **not** cite run **`37379529193`** (that success is `41b05a4` only) or `37351685421`. `gh` still unauthenticated here. |
| `7761af6` → `41b05a4` | Team 5 `POLICY_QA_T2.md` + INJECTED non-register issuance lock **and** `package.json` `test:grin-t5-issuance-non-register`. **Not** exclusively narrative documentation. |
| Local `ci:verify` | **PASS** on `7761af6` (includes `b845e8a`). `test:all` **159/159** in 273.9s. Invoice-renderer Docker skipped locally. |
| Team 2 S1/S2 slice | `0cd3473ab5aee2d88d31662e29794839bd9ee8aa` on `team/grin-t2-s1s2` (local `team/grin-t2-evidence` not force-pushed) |
| Team 2 quota/lifecycle slice | `14e56f3802e29825708db591a5feb5bf8b000178` |
| `git diff` vs `5d5df3d` | **non-empty** on `functions/src/goodsEvidence` (issuance quota, storage accounting, expiry). Ops pin for live GRIN deploy must be **re-reviewed** before A3. |
| Live billing restriction | **Not deployed.** Live handlers still only the enablement key (absent). |
| **Operational tooling SHA** | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` |
| Docs checkpoint (Team 4 billing fold) | `aa5253e4e070195227055cde836d6b528d5e0070` |
| Tooling suite | `node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` **34/34** (TOOLING, not application CI) |
| Merge-base / `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |
| `git diff` application pin | **stale for this tree** — `functions/src/goodsEvidence` now differs from `5d5df3d`. Do not deploy GRIN from the old pin. |
| version | **1.0.0** / versionCode **23 unreserved** |
| firebase-tools | **14.20.0** |
| gcloud | **ABSENT** on this workstation (required on apply host for enable/disable) |
| eas CLI | **present** on combined earlier as `eas-cli/24.10.0`; Team 3 used `npx eas-cli@16.28.0`. No `internal-grin` or `5d5df3d` Android builds; highest EAS versionCode **22**. Play App bundle explorer **RUN** 2026-10-06 (read-only): 9 versions; highest uploaded **vc22 Active**; searches 23/21/18 empty; Internal testing **Active Vc22**. versionCode **23 UNRESERVED**. |
| gh | not authenticated (git push of #31 still succeeded) |

Do not reopen ops-guard A/B without a new concrete reproduction.

---

## Readiness

| Gate | State |
|---|---|
| SOURCE READY | S1/S2 source at `520f9f9`. Team 5 **S1 PASS / S2 PASS** at INJECTED + named G2 EMULATOR (`127.0.0.1:8091` / `9200`, `demo-vyaamikk-grin-g2`; `1e33894`). P3 accepted. **P8 FAIL**. Canonical GHA for this SHA **NOT YET**. Do not cite `37379529193`. Do not advertise GiB. Pin still unapplied pending Team 1. |
| BACKEND PILOT READY | Prepared; **not authorized**; GRIN seven **ABSENT** on live. Create-absent-only planner exists, **not wired**. Enable/disable still UNPROVEN on firebase-created gen2. |
| INTERNAL BUILD READY | Packet prepared (`APPROVAL_B_DRAFT.md`); **not authorized**; freeze SHA **placeholder** (post-S1/S2). Play inventory **RUN** 2026-10-06; versionCode 23 not reserved; no `internal-grin` / `5d5df3d` EAS AAB; B1≠B2 |
| DEVICE ACCEPTED | Execution sheet ready; **NOT RUN** |
| BILLING ACCEPTED | Source fail-closed + **undeployed** tester UID allowlist; live `PLAY_BILLING_ENABLED` absent; catalog **NOT RUN**; purchases **off**. Deletion: 15 implemented / 180 requested / public UNRESOLVED. |
| PUBLIC SUBMISSION READY | Blocked on owner GiB confirm, public deletion policy, device, billing, listing/disclosure. Local `ci:verify` is not Play/device acceptance. |
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
| 1 Backend | A1 still independently offerable. Pin `5d5df3d` **STALE** vs `520f9f9`. Team 5 post-fix **PASS** at INJECTED+EMULATOR. Do **not** pin until Team 1 `REVIEW_AFTER_S1_S2`. Do not env-override. Ops-guard `228a8f5`. | Live Functions/Rules/IAM/admission/enable |
| 2 Policy | S1/S2 folded (`0cd3473` → combined `520f9f9`). Holds `1.o.{len}.{ledgerId}.{len}.{evidenceId}`; `MAX_STORAGE_HOLDS=2500`. Economics: bucket location **UNKNOWN**; do not advertise 1/5/20; 256 MiB/1/5 GiB alternative not selected, not guaranteed profitable. `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`. 15-day grace unchanged. | Owner GiB confirm; 180-day public policy; no live purge |
| 3 Build/device | Play explorer **RUN** 2026-10-06 (vc22 highest uploaded; 23 **unreserved**). Freeze SHA candidate `520f9f9` **only after** matching canonical CI. Device sheet **NOT RUN**. B1≠B2, neither granted. | EAS/native build; Play upload (separate); Play Console re-read before B1 |
| 4 Billing/Play | Owner sheet `DELETION_15_VS_180_OWNER_SHEET.md` (15 implemented / 180 requested / public UNRESOLVED). Catalog **NOT RUN**. Allowlist SOURCE, not live. | Product/price/activation/submission; owner A/B/C/D |
| 5 QA | Post-fix `S1_S2_POST_FIX.md` (`1e33894`). **S1 PASS** / **S2 PASS** INJECTED + G2 EMULATOR `8091`. **P3 ACCEPTED**. **P8 FAIL**. Device/Play/live/GHA **NOT RUN**. | Does not own implementation; not device/live/billing |

---

## Owner decisions (recorded 2026-10-06)

See `docs/release/packets/OWNER_POLICY_DECISION_SHEET.md`. Authorize **source
implementation and tests** only. Not live deploy / billing / Play publish.

| Topic | Owner choice | Residual hold |
|---|---|---|
| GRIN pricing | **A — include in existing Starter / Professional / Business.** No separate SKU. One new issuance consumes one monthly record allowance. | Packet E real-store acceptance before public commercial copy |
| Storage quota | **Proposed 1 / 5 / 20 GiB** in source, labelled pending confirmation. **Do not advertise.** Team 2 alternative: **256 MiB / 1 GiB / 5 GiB**. | Owner confirm proposal or alternative |
| Active / expiry | Keep issued evidence while entitled. After genuine expiry: 90-day read/export then 30-day notice. **No production purge job this assignment.** | Source state machine only until approved deploy |
| Explicit deletion | **Three facts, not one:** implemented **15 days**; owner requested **180 days**; public-approved policy **UNRESOLVED**. Team 4 Play-risk framing: do not ship 180-day pending as deletion; do **not** treat 15 as the recorded owner choice; do not substitute 30. See `DELETION_15_VS_180_OWNER_SHEET.md`. | Owner+counsel fill A/B/C/D on that sheet |
| Export | Pack is summary (`originalsBundled=false`). Originals + record export required. ZIP optional. | Device proof NOT RUN |
| Testers | Owner + two trusted testers, separate accounts. Identities **not supplied**. | Owner UIDs/devices |

Internal Testing: **synthetic** GRIN evidence until lifecycle is **approved
for live use**. Source machinery exists; `INCLUDE_GRIN_IN_ACCOUNT_PURGE`
stays false. Real customer GRIN evidence remains blocked until then.

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
