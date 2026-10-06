# Release completion register — Internal GRIN / billing / public candidate

Coordinator register. Not authorization. Not a “bug-free” promise.
Target public availability **18 October 2026** is a delivery date, not a gate
bypass and not a Play-approval promise.

Wave 2 is **not** accepted. Encrypted PDF backup remains backlog.

Evidence labels: SOURCE / INJECTED / SQLITE_HOST / EMULATOR /
MOUNTED_INERT_NATIVE / NATIVE_DEVICE / PLAY_INSTALLED / LIVE_BACKEND /
TOOLING (ops-guard suite; not application CI).

---

## Current state (authoritative — 2026-10-06 closeout)

Single table. Later team reports under this file are **historical evidence**.
If they still say “unapplied pin”, “unpushed”, or “canonical CI pending”
for `520f9f9` / `0d7aa17`, those lines are **superseded** here. Do not
rewrite those files as if they were re-run today.

| Item | Current value |
|---|---|
| Repo / branch / PR | `specialsoftwares/vyaamikk-diary` `integration/grin-g1-g5-source` draft **#31** (no duplicate; auto-merge off) |
| **PR / published HEAD** | `0d7aa17a6efcf3ce6874269eb57afda0a2b45559` |
| Tested checkout parent | `074f082a9f17ef1e8c53958cffc8b13bc0a6c5a8` (docs fold of T5 post-fix). Application ancestor `520f9f9`. |
| **Application SHA** | `520f9f98bc952fd7f30a907da9e85774629a69c0` (S1/S2; cherry-pick of `0cd3473`). `git diff --stat 520f9f9 0d7aa17 -- functions src eas.json app.json app firebase.json tools/goods-evidence-storage` **empty**. Pre-fix was `b845e8a`. |
| Helper `PINNED_APP_SHA` | **`520f9f9`** (constant in `grin-functions-op.mjs` at `0d7aa17`) |
| **Tooling SHA** | **`0d7aa17`** — successor. **Not** byte-identical to `228a8f5` (`grin-functions-op.mjs` **+1/−1**: pin constant only). |
| Historical ops-guard baseline | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f`. Suite **34/34** recorded on **that** tree. Same suite **34/34** re-run after the pin apply on the successor tree (TOOLING, not application CI). Live mode still rejects `GRIN_OPS_PINNED_SHA`. |
| **Canonical CI** | Independently observed GitHub Actions run **`37425360211`**, job **`112143748428`**, workflow head **`0d7aa17`**, verify + canonical repository gate **success**. Skipped steps: **none observed** in jobs API. Do **not** cite `37379529193` (`41b05a4`) or `37351685421` (`5d5df3d`) for this tree. Inner suite counts **not invented**. `gh` unauthenticated here. |
| S1 / S2 | **Closed** at SOURCE / INJECTED / named G2 EMULATOR (`127.0.0.1:8091` / `9200`, `demo-vyaamikk-grin-g2`). Not live. Not device. |
| P3 | **ACCEPTED** (first GRIN register consumes one monthly slot; replay/amend/QC/return/evidence/reconcile do not). |
| P8 | **OPEN / FAIL** (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`; public deletion policy UNRESOLVED). |
| Device / live backend / billing / public | **Not accepted** |
| Next approval | **A1 presented** (`A1_PRESENT.md`) — isolated Firestore Rules only; **not executed**. A2–A7 not implied. |
| Pending owner decisions | Storage GiB (1/5/20 vs 256 MiB/1/5 GiB); public deletion window (15 implemented / 180 requested / UNRESOLVED). |
| versionCode | **23 UNRESERVED**. Play explorer 2026-10-06: highest uploaded **vc22**. |
| Merge-base / `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |

Do not cherry-pick `0cd3473` / `520f9f9` again. Do not force-push divergent
team branches. Do not reopen ops-guard A/B without a new reproduction.

---

## Readiness

| Gate | State |
|---|---|
| SOURCE READY | Application `520f9f9` + tooling `0d7aa17`. Canonical GHA **`37425360211` success**. S1/S2 closed at INJECTED+EMULATOR. P3 accepted. **P8 FAIL**. Do not advertise GiB. |
| BACKEND PILOT READY | **A1 offerable, not authorized.** GRIN seven **ABSENT**. A2–A7 HOLD. |
| INTERNAL BUILD READY | Freeze SHA **`520f9f9`** + CI **`37425360211`** (`APPROVAL_B_DRAFT.md`). B1≠B2, **neither granted**. vc23 unreserved. Owner device form **blank**. |
| DEVICE ACCEPTED | **NOT RUN** (no hardware; testers unnamed) |
| BILLING ACCEPTED | Fail-closed; catalog **NOT RUN**; purchases **off** |
| PUBLIC SUBMISSION READY | Blocked on owner GiB, public deletion policy, device, billing, listing |
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
| 1 Backend | A1 **presented** (`A1_PRESENT.md` `80da828`). Isolated Firestore Rules only. A2–A7 **HOLD**, not implied. Hashes re-verified. Not executed. | Owner A1 grant; A2–A7 remain separate |
| 2 Policy | S1/S2 folded (`0cd3473` → combined `520f9f9`). Holds `1.o.{len}.{ledgerId}.{len}.{evidenceId}`; `MAX_STORAGE_HOLDS=2500`. Economics: bucket location **UNKNOWN**; do not advertise 1/5/20; 256 MiB/1/5 GiB alternative not selected, not guaranteed profitable. `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`. 15-day grace unchanged. | Owner GiB confirm; 180-day public policy; no live purge |
| 3 Build/device | Freeze **`520f9f9`** + GHA **`37425360211`**. Play explorer 2026-10-06 must be **re-read before B1**. vc23 **unreserved**. Owner device form blank. Device rows **NOT RUN**. B1≠B2, neither granted. | EAS/native build; Play upload (separate) |
| 4 Billing/Play | Owner sheet `DELETION_15_VS_180_OWNER_SHEET.md` (15 implemented / 180 requested / public UNRESOLVED). Catalog **NOT RUN**. Allowlist SOURCE, not live. | Product/price/activation/submission; owner A/B/C/D |
| 5 QA | Pin/CI closeout `CLOSEOUT_0d7aa17.md` (`00fd822`). TOOLING+SOURCE CI **PASS**. S1/S2 not reopened. **P3 ACCEPTED**. **P8 FAIL**. Device/live/billing **NOT RUN**. T3 freeze docs landed after this review. | Waiting T2/T4 new source; not device/live |

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

## Next concrete approval — A1 (not executed)

**A1 changes Firestore access rules only. It does not deploy Functions,
change Storage Rules/IAM, seed testers, enable GRIN, build the app,
enable payments, or submit to Play.**

Exact later command (firebase-tools **14.20.0**, cwd repo root):

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules
```

Hashes re-checked on combined `0d7aa17` this session (`shasum -a 256`):

| Artifact | sha256 |
|---|---|
| Isolated config `firebase.rules-only.json` | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Firestore | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Live baseline / rollback Firestore | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| **Forbidden** repo-root `firestore.rules` | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` |

Live inspect 2026-10-06: Firestore sha256 **= baseline**. If a future inspect
differs, **abort** — do not apply this merged file. Rollback bytes:
`docs/release/rules-compat/live-export-2026-10-06/`. After a later grant,
post-deploy live Firestore sha256 must equal **`551203b8…`**; Storage
`1a912051…` unchanged; GRIN seven still ABSENT.

Do **not** execute A1 without explicit owner approval. A2–A7 are **not**
implied.

Full packets: `APPROVAL_A_BACKEND_PILOT.md`, `APPROVAL_B_INTERNAL_BUILD.md`,
`APPROVAL_C_RESTRICTED_BILLING.md`, `APPROVAL_D_PUBLIC_SUBMISSION.md`.

HOLD until written: main merge, live Functions/Rules/IAM/env writes, tester
admission, GRIN activation, EAS/native/OTA, Play upload/track/product,
billing activation, public rollout. `GRIN_OPS_ALLOW_LIVE=1` remains HOLD.
