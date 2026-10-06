# Release completion register — Internal GRIN / billing / public candidate

Coordinator register. Not authorization. Not a “bug-free” promise.
Target public availability **18 October 2026** is a delivery date, not a gate
bypass and not a Play-approval promise.

Wave 2 is **not** accepted. Encrypted PDF backup remains backlog.

Evidence labels: SOURCE / INJECTED / SQLITE_HOST / EMULATOR /
MOUNTED_INERT_NATIVE / NATIVE_DEVICE / PLAY_INSTALLED / LIVE_BACKEND /
TOOLING (ops-guard suite; not application CI).

---

## Current state (authoritative — 2026-10-06)

Single table. Later team reports under this file are **historical evidence**.
If they still say “unapplied pin”, “unpushed”, or “canonical CI pending”
for `520f9f9` / `0d7aa17`, those lines are **superseded** for that SHA.
Do not rewrite those files as if they were re-run today.

| Item | Current value |
|---|---|
| Repo / branch / PR | `specialsoftwares/vyaamikk-diary` `integration/grin-g1-g5-source` draft **#31** (no duplicate; auto-merge off) |
| **CI-tested PR head** | GHA **`37445383607` SUCCESS**, job **`112208918347` `verify`**. Checkout **`7e0d629023198333ed384ae076285925e98047d6`**. Parent **`d4c7ed4`**. Application blobs **= `540e07a`**. Prior success `37440328976` covers `fcda7cd` / `70bdfe4` only. |
| **Current application SHA** | **`540e07aa07f376716484adb879ce66cb9fb170ce`** (P8 inert purge path on `60c4bc1` billing lifecycle). Flag **`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`**. Purchase-entry **`"0"`**. **Do not advertise GiB.** |
| **Selected Internal candidate** | **`540e07a`**. T5 SOURCE+INJECTED **PASS** (`b3b1c97`). Matching CI **SUCCESS**. Do not build `60c4bc1` / `fcda7cd` / `520f9f9` / `56f2040` / `313025f` alone. B1≠B2 **neither granted**. |
| Helper `PINNED_APP_SHA` | **`540e07aa07f376716484adb879ce66cb9fb170ce`** — **applied**. Live mode still rejects `GRIN_OPS_PINNED_SHA`. A3 **not executed**. |
| **Tooling SHA** | **`2d33f6d252d66a89d6fcef5cf75feaf268e7e7b2`** — helper `PINNED_APP_SHA` only. **Separate from** application `540e07a`. Ops-guard **34/34**. Historical `228a8f5` / `0d7aa17` remain history. |
| Historical ops-guard baseline | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` **34/34**. Re-run after this pin: **34/34**. Live mode still rejects `GRIN_OPS_PINNED_SHA`. UNKNOWN inventory still refuses mutate. |
| **Canonical CI** | GHA **`37445383607` SUCCESS** on `7e0d629` / app **`540e07a`**. Job `112208918347`. |
| S1 / S2 | **Closed** at SOURCE / INJECTED / named G2 EMULATOR (`127.0.0.1:8091` / `9200`, `demo-vyaamikk-grin-g2`). Not reopened (no new reproduction). Not live. Not device. |
| P3 | **ACCEPTED**. Coordinator re-ran `quota.injected.unit.test.ts` **PASS** after `313025f`. |
| P8 | **OPEN / FAIL** (flag **false**; GRIN omitted from default purge). Production-path packet + inert wiring landed (`540e07a`). Later grant = one-line flip. **Not flipped. Not live.** GRIN **synthetic-only**. |
| Owner storage (2026-10-06) | **1 / 3 / 10 GiB wired** as `OWNER_SELECTED_STORAGE_CAPS_BYTES`. Historical 1/5/20 and 256 MiB/1/5 named, not live. **Do not advertise.** |
| Owner deletion (2026-10-06) | **45-day** grace wired (`DELETION_GRACE_DAYS=45`). Supersedes 180. Play freeze ≠ delete. GRIN purge flag **false**. |
| Device / live backend / billing / public | **Not accepted** |
| Next approval | A–F in `CONSOLIDATED_PILOT_PACKET.md`. **Not executed.** Owner has not lettered live ops. P8 live flip **separate**. |
| Device named | OnePlus 12R, Android 16, vc22 installed, available today. **Upgrade device.** Clean-install device **unnamed**. Owner Firebase UID **received privately (out-of-repo)**. Values **not in git**. Admission **writes HOLD**. |
| versionCode | **23 UNRESERVED**. Play explorer 2026-10-06: highest uploaded **vc22**. |
| Merge-base / `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |

Do not cherry-pick `0cd3473` / `520f9f9` / `2cebe32` / `ad72d79` again. Do not force-push
divergent team branches. Do not reopen ops-guard A/B without a new
reproduction. Do not reopen S1/S2 without a new reproduction.

---

## Today execution board (2026-10-06)

| Item | Owner | Next action | Dependency | Evidence | Blocker |
|---|---|---|---|---|---|
| Wire 1/3/10 GiB + 45-day grace | T2 | **Landed** combined `313025f` (`ad72d79`) | done | coordinator tests PASS | do not advertise; P8 still FAIL |
| Canonical CI on selected SHA | coordinator | GHA **`37445383607` SUCCESS** job `112208918347` on `7e0d629` / app **`540e07a`** | done | public API | — |
| Pin helper to selected SHA | coordinator apply | **Applied** `PINNED_APP_SHA=540e07a`. Ops-guard **34/34** | T5 PASS + CI SUCCESS | TOOLING 34/34 | A3 not executed |
| Consolidated backend packet | T1 | **Landed** `a28bfb0`. C names **`540e07a`**. Pin HOLD until CI SUCCESS | owner letter of complete batch | inspect 2026-10-06 | A6 UNPROVEN; no live execute |
| Internal AAB packet | T3 | **Landed** `PHONE_HANDOFF.md`. B1 of `540e07a` after pin+CI SUCCESS | CI SUCCESS | OnePlus 12R named | B1 ungranted |
| Restricted billing packet | T4 | **Landed** in `60c4bc1`. T5 SOURCE+INJECTED **PASS** `c69ffb9`. Catalog **NOT RUN** | pin of `540e07a` after CI | FakePlay nine cases | activation HOLD |
| P8 production path | T2 | **Landed** packet `b08690d` + inert wiring `540e07a`. Flag **false** | owner live grant later | `grinCleanup` + `deletion.unit` PASS | do not flip; synthetic-only |
| Phone acceptance | T3 + owner | vc22 upgrade after B2 | AAB + private UID on file | device **NOT RUN** | no AAB; D writes HOLD |
| Review `60c4bc1` lifecycle | T5 | **Landed** `REVIEW_60c4bc1.md` `c69ffb9`. SOURCE+INJECTED **PASS** | done | FakePlay nine cases | leftover P3-FAIL stay dirty |
| Review `540e07a` P8 wiring | T5 | **Landed** `REVIEW_540e07a.md` `b3b1c97`. SOURCE+INJECTED **PASS**. P8 **FAIL** operationally | done | `grinCleanup` + `deletion.unit` | leftover P3-FAIL stay dirty |

---

## Readiness

| Gate | State |
|---|---|
| SOURCE READY | Application **`540e07a`**. T5 SOURCE+INJECTED **PASS** (`b3b1c97`). GHA **`37445383607` SUCCESS** on `7e0d629`. Helper pin **applied**. **P8 FAIL** (flag false). |
| BACKEND PILOT READY | A–F packet present. **Not executed.** A/B YES on paper after inspect=baseline. C pin **applied**, live create HOLD (owner letter). D UID `count=1` writes HOLD. E LIVE HOLD (`gcloud` absent; seven ABSENT; preservation not live-verified). F INJECTED YES / LIVE HOLD. |
| INTERNAL BUILD READY | T3 `PHONE_HANDOFF.md`. B1 of **`540e07a`** after owner letter. B1≠B2 **neither granted**. Not a purchase-test build. Recheck Play before B1. |
| DEVICE ACCEPTED | **NOT RUN**. OnePlus 12R available today — not yet executed. |
| BILLING ACCEPTED | Lifecycle SOURCE+INJECTED **PASS** at `60c4bc1` (`c69ffb9`); catalog **NOT RUN**; purchases **off**; REAL-CHARGE **not run** |
| PUBLIC SUBMISSION READY | Blocked on wired 1/3/10+45d, device, billing, listing. Owner writes recorded. |
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
| 1 Backend | A–F packet. Pin **applied** to `540e07a`. A/B two commands. C live HOLD. D `count=1` writes HOLD. E LIVE HOLD. F INJECTED YES / LIVE HOLD. **Not executed.** | Owner letters complete batch; inspect first |
| 2 Policy | P8 packet `b08690d` + inert wiring `540e07a`. Flag **false**. P3 PASS. P8 FAIL operationally. GRIN **synthetic-only**. **Do not advertise.** | Live purge grant = one-line flip; not done |
| 3 Build/device | `PHONE_HANDOFF.md`. OnePlus 12R upgrade. B1≠B2 **ungranted**. Purchase-entry `"0"`. Device **NOT RUN**. Slot O UID private. | EAS B1 of `540e07a` after owner letter; Play B2 separate |
| 4 Billing/Play | Lifecycle correction in **`60c4bc1`**. T5 SOURCE+INJECTED **PASS** (`c69ffb9`). Catalog **NOT RUN**. Purchase-entry `"0"`. | Activation HOLD |
| 5 QA | `REVIEW_540e07a.md` **PASS** `b3b1c97`. **P8 FAIL** operationally. Device/live **NOT RUN**. | Leftover P3-FAIL stay dirty |

---

## Owner decisions (recorded 2026-10-06)

See `docs/release/packets/OWNER_POLICY_DECISION_SHEET.md`. Authorize **source
implementation and tests** only. Not live deploy / billing / Play publish.

| Topic | Owner choice | Residual hold |
|---|---|---|
| GRIN pricing | **A — include in existing Starter / Professional / Business.** No separate SKU. One new issuance consumes one monthly record allowance. | Packet E real-store acceptance before public commercial copy |
| Storage quota | **Owner 2026-10-06: 1 / 3 / 10 GiB — wired** (`313025f`). **Do not advertise.** | Listing copy HOLD |
| Active / expiry | Keep issued evidence while entitled. After genuine expiry: 90-day read/export then 30-day notice. **No production purge job this assignment.** | Source state machine only until approved deploy |
| Explicit deletion | **45-day grace wired.** Supersedes 180. Play freeze ≠ delete. `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`. | Do not flip GRIN purge flag |
| Export | Pack is summary (`originalsBundled=false`). Originals + record export required. ZIP optional. | Device proof NOT RUN |
| Testers | Owner + two trusted testers. OnePlus 12R Android 16 vc22 **named**. Owner slot **O** uses an **existing** account; UID **received privately**. Values **not in repo**. Clean-install device unnamed. | D writes HOLD; T1/T2 UIDs still missing |

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

Hashes re-checked on combined after the T2 fold (`shasum -a 256`; Rules blobs unchanged vs `520f9f9`):

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
