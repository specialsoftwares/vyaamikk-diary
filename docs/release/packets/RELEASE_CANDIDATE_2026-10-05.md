# GRIN release candidate — coordinator packet (2026-10-05)

Superseded for packaging closeout by
`docs/release/packets/PACKAGING_CLOSEOUT_2026-10-05.md`.
This file remains the earlier RC snapshot (application then `dcc325a`).

Not authorization for main merge, production exports, live deploy, EAS/native
build, OTA, Play mutation, billing activation, or public rollout.

Independent Team 5 gate review:
`docs/release/proposals/team5/RELEASE_CANDIDATE_GATE_REVIEW.md`
(source inspection of `dcc325a`; SQLITE_HOST / pack-complete **not** re-run
this session). Wave 2 **not accepted**. Blockers RC-01…RC-11 in that file.

Team worktrees were **not** overwritten. Their last owned commits remain
behind combined: T1 `15bd2a6`, T2 `29c6d3f`, T3 `0d0dd84`, T4 `83f10f8`,
T5 `ee4be8a`. Combined already contains those landings plus later coordinator
closeouts through confirmation-refresh.

---

## A. Verified refs and canonical CI

| Ref | SHA |
|---|---|
| Branch | `integration/grin-g1-g5-source` |
| Application (reviewed) | `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` |
| Published head at start of this assignment | `741194009a41af7870a6b2a856ad2f226d0e697d` (docs after `dcc325a`) |
| `origin/main` / merge-base | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |

Application vs documentation: `dcc325a` is the last **application** commit in
scope. `1d5ab2f` and `7411940` are Team 5 / coordinator **docs** only.

**Combined PR:** none (GitHub pulls search empty; API `head=specialsoftwares:integration/grin-g1-g5-source` count 0). `gh` not logged in. Previous ChatGPT 403 not retried.

**Canonical GitHub `ci:verify`:** **not obtained.** Actions on this branch
`total_count` 0. Workflow `.github/workflows/ci.yml` contains **no** deploy
action (verify job only: `npm ci`, functions `npm ci`, `npm run ci:verify`).
Triggers: PR-to-`main`, push-to-`main`, `workflow_dispatch`.

Prior **local** `ci:verify` on `dcc325a`: exit 0, `test:all` 152/152, joined
GRIN emulators included, **renderer Docker skipped**. That is **not** complete
canonical CI.

Owner create-draft steps: `docs/release/packets/DRAFT_COMBINED_PR.md`  
Compare: https://github.com/specialsoftwares/vyaamikk-diary/compare/main...integration/grin-g1-g5-source

## B. Remaining source blockers (reviewed application scope)

**None that reopen `dcc325a` confirmation-refresh or FileHandle production
reads** without a new reproduction. Team 5 independently agreed (source
inspection only this session).

Still **not** source-complete for a **working live Functions export**: adapters
live under `tools/`; `functions/src/goodsEvidence/callables.ts` stay fail-closed
even with env `"true"`; `functions/src/index.ts` has no GRIN export. Team 5
**RC-01/RC-02** — deployment packaging, not a domain rewrite.

HOLDs still true: default-off, store-runtime block, live Rules without GRIN
matchers, purchase-entry `"0"`, legal date `2026-07-27`, versionCode 23
unreserved, encrypted backup backlog.

Secret scan: gitleaks 8.24.3 on `0da2f58..HEAD` (`git rev-list` 119; gitleaks
logged 91). 3 false-positive `generic-api-key` hits on type alias
`G2AdmissionGate`. Team 5 confirmed. See
`docs/release/packets/SECRET_SCAN_2026-10-05.md`.

## C. Backend change proposal and rollback

Full executable text: `docs/release/packets/A_GRIN_BACKEND_EXPORTS_UNDEPLOYED.md`

- Project `vyaamikk-diary`, region `asia-south1`, seven callables including
  **`grinBeginEvidenceUpload`** (not `grinBeginEvidence`).
- Merge GRIN matchers into a **fresh live** Firestore/Storage export
  (live 2026-10-01 Firestore sha256 `b13d5255…` = billing-off compat;
  Storage `1a912051…`). **Do not** deploy repo-root quota `firestore.rules`
  (`233b05b7…`).
- Seed per-uid `goodsEvidenceAdmission/runtime` for testers only.
- First disable: unset `GRIN_GOODS_EVIDENCE_FUNCTIONS`. **Do not delete**
  serials, issued receipts, or original objects.

## D. Internal build / admission proposal

Full text: `docs/release/packets/B_INTERNAL_TESTING_ADMISSION.md`

- Artifact: **production-profile AAB**. APK is a separate labelled device artifact.
- Visibility (later patch): `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1` **and**
  `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT=1` on that AAB only, plus
  featureFlag exception. Not a Play-track signal.
- Authorization: Packet A admission docs, independent of UI.
- Recheck Play bundle inventory before versionCode; **23 is not reserved**.
- Upgrade from Internal **vc22** must migrate SQLite `DB_VERSION` 10.

## E. Owner decisions (recommended)

Full text: `docs/release/packets/D_OWNER_POLICY_OPTIONS.md`

| Topic | Recommend | Blocks if unset |
|---|---|---|
| Pricing | **C** invite-only for Internal | Public GRIN needs **A or B** written |
| Storage quota | Internal: **C + technical ceilings**; public: **B** | Public upload |
| Retention | Internal: wipe-warning OK; public needs **A or B implemented** | Production admission that piles originals |

Not legal advice. Do not invent statutory retention.

## F. Device checklist and who executes

- Checklist: `docs/release/packets/C_DEVICE_CHECKLIST.md`
- Upload/memory cases: `docs/release/packets/T2_DEVICE_UPLOAD_READINESS.md`
- **Who:** owner or named tester on hardware. This environment has no phone.
  D1 = current Internal vc22 device (upgrade). D2 = clean install. Measure
  RSS/PSS via `dumpsys meminfo`. FileHandle tests are not device PASS.

## G. Billing / public-release gates

`docs/release/packets/E_BILLING_LATER.md` — purchase-entry stays `"0"`. Public
18 Oct additionally needs Packet D written+implemented, canonical CI, production
listing, device on the production-track binary, and a later main-merge
authorization. Internal success does not close G.

Play listing/Data safety/reviewer worksheet (not submitted):
`docs/release/packets/PLAY_LISTING_DATA_SAFETY_REVIEWER.md`

Finite gates: `docs/release/GRIN_CLOSURE_CHECKLIST.md`. Historical matrix
`docs/release/GRIN_ACCEPTANCE_MATRIX.md` is not the operational list (G2 `tbd`
rows are stale).

Jira: no authorized Atlassian session — notes appended to
`docs/release/UNSENT_JIRA_GRIN_G1.md` only.

---

## Approvals requested (concrete; none implied)

1. **Draft PR:** owner runs `gh auth login` and creates the draft in
   `DRAFT_COMBINED_PR.md` (or confirm if they already opened one elsewhere).
2. **After that PR exists:** record canonical Actions `ci:verify` (no extra
   local full-gate rerun for docs-only).
3. **Backend (separate):** approve Packet A packaging (functions-local Admin
   compose) + live Rules merge + tester uid list — then a later deploy
   authorization. Not this message.
4. **Build (separate):** fresh Play inventory, then EAS production AAB, then
   Internal upload. Approve Packet B visibility patch if testers must see GRIN
   on a store-runtime binary.
5. **Device:** owner/tester executes Packet C + Team 2 U-01…U-10.
6. **Packet D:** write C/A/B choices; public GRIN stays blocked until then.

Do not approve “continue?” in the abstract.
