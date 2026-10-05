# Internal GRIN — operational preflight packet (not authorization)

Do **not** execute live deploy, Rules/IAM/env writes, tester seeding, main
merge, EAS/native build, OTA, Play writes, or billing activation from this
packet.

Wave 2 is **not** accepted. Not G6.

Guarded commands (replace copy-paste snippets):
`docs/release/packets/grin-ops/grin-functions-op.mjs`

Stub tests (not application CI):
`node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs`
(15/15 pass this session).

Team 5: `docs/release/proposals/team5/INTERNAL_GRIN_PREFLIGHT_PACKET_REVIEW.md`.

---

## 1. Coordinates

| Ref | Value |
|---|---|
| Branch | `integration/grin-g1-g5-source` (draft PR #31) |
| **Application SHA** | `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` |
| Application CI | run **`37351685421`**, job **`111903806888`**, `ci:verify` success |
| Do **not** reuse | `37344993645` |
| **Packet / tooling SHA** | the commit that contains this revision (distinct from `5d5df3d`). Record after it lands. Not application CI. |
| Merge-base / `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |

Deploy from a later docs HEAD only if
`git diff --stat 5d5df3d54df08953bfb26db39a9b7f5e3d67ed47 -- functions src eas.json app.json app firebase.json`
is empty **and** those paths are clean of untracked files. A matching HEAD
alone is not a clean tree.

version **1.0.0** / versionCode **23** (unreserved). Purchase-entry and
quota-upsell `"0"`. Ordinary profiles GRIN-off.

---

## 2. Tooling

| Tool | Version |
|---|---|
| firebase-tools | **14.20.0** (CLI + CI pin) |
| Node | v20.19.4 |
| gcloud | **not installed** on this workstation; required on the apply host for enable/disable |

Working directory for Functions: **repository root**.
Dotenv parser: firebase-tools `lib/functions/env.js` (not a handwritten parser).

Firebase dotenv enable/disable is **blocked**. Loading any CLI dotenv
**replaces** previous user environment on the endpoints in that deploy
(firebase-tools 14.20.0 `inferDetailsFromExisting`). A single-key dotenv is
not an approved general method. Do not copy secrets or other env values into
dotenv. Direct Cloud Run env edits are not used.

---

## 3. Read-only live preflight — **verified** (2026-10-06)

`firebase login --reauth` completed as `support.vyd@specialsoftwares.com`.
Inspect via `node docs/release/packets/grin-ops/grin-functions-op.mjs inspect`
(Google APIs; token never printed). No mutation.

| Check | Result |
|---|---|
| Project | `vyaamikk-diary` / **`982505811909`** (HTTP 200) |
| Bucket | `vyaamikk-diary.firebasestorage.app` projectNumber **`982505811909`** (belongs) |
| GRIN seven callables | **all ABSENT** (genuinely new) |
| Unrelated asia-south1 functions | **39** present (identity/email/deletion/billing). Not in GRIN `--only` list. |
| Runtime SA (from `mintClientAuthToken`) | `982505811909-compute@developer.gserviceaccount.com` |
| Project IAM for that SA | **`roles/editor`** (HTTP 200). Residual: Editor includes Storage object delete. Do not *use* delete as rollback. Do not add more roles this packet. |
| Firestore database IAM API | HTTP **501** (not used; Editor is project-level) |
| Bucket IAM bindings for that SA | none listed (HTTP 200); Editor remains the residual |
| Firestore rules sha256 | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` **= baseline** |
| Storage rules sha256 | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` **= baseline** |
| Firestore release / ruleset | `cloud.firestore` / `projects/vyaamikk-diary/rulesets/a19b4a83-8b3e-4cf5-b8b8-e8d26e9704f9` (create 2026-06-05, update 2026-09-21) |
| Storage release / ruleset | `firebase.storage/vyaamikk-diary.firebasestorage.app` / `…/a2a0ddf7-9746-4dd2-bd48-29c9abc0e41f` (create/update 2026-07-23) |

No Rules drift vs the approved merge base. Do **not** treat those ruleset IDs
as a hardcoded forever-rollback; rollback bytes are the **this-session**
export below. Isolated GRIN Rules config is unchanged. Do not deploy
repo-root quota Firestore (`233b05b7…`).

---

## 4. Isolated Rules artifacts (undeployed)

Repo `firebase.json` still points at quota Rules + functions. Unchanged.

| Artifact | sha256 |
|---|---|
| Isolated config `docs/release/rules-compat/proposed-grin/firebase.rules-only.json` | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Merged Firestore | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Merged Storage | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` |

Later-authorized Rules (not this assignment):

```bash
cd /path/to/vyaamikk-diary
node docs/release/packets/grin-ops/grin-functions-op.mjs check-preflight
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules,storage
```

`--only firestore:rules,storage` (not `--only firestore`). Always
`--project vyaamikk-diary` with this `--config`.

---

## 5. Rollback artifacts (actual pre-deploy export)

Directory: `docs/release/rules-compat/live-export-2026-10-06/`

| File | Role |
|---|---|
| `firestore.rules` | live Firestore source bytes (sha256 = baseline) |
| `storage.rules` | live Storage source bytes (sha256 = baseline) |
| `META.json` | release IDs, ruleset IDs, timestamps, hashes, identity summary (no env values) |

If Rules are later deployed, roll **forward** to these files (via an isolated
config pointed at this directory), after confirming they still match a fresh
export at apply time. Do not delete receipts, serials, or Storage objects.
Do not grant/use object delete.

---

## 6. Guarded Functions operations (later authorization)

Executable: `docs/release/packets/grin-ops/grin-functions-op.mjs`

Guarantees (stub-proven):

- Validates cwd, pin, and deployment inputs first.
- Rejects dirty/untracked `functions src eas.json app.json app firebase.json`;
  does not reset or stash.
- Abort on every failed prerequisite; failed prechecks never invoke Firebase
  or gcloud.
- Checks all CLI dotenv names **before** creating anything; never overwrites
  or removes operator-owned dotenv.
- Creates only `0700` temp dirs under the OS tmpdir (`grin-ops-*`); cleans
  **only** those, including on failure and SIGTERM.
- Preserves the deploy executable’s exit status; does not claim PASS on
  failure.
- Prints no env values, tokens, or credentials.
- Does not rely solely on `set -e`.

Mutating commands also require `GRIN_OPS_ALLOW_LIVE=1` on the apply host
(unset here; `stub` is tests only).

### 6.1 Inspect (read-only; already run)

```bash
cd /path/to/vyaamikk-diary
node docs/release/packets/grin-ops/grin-functions-op.mjs inspect
```

### 6.2 Initial gate-off (Firebase seven-function **create**, no dotenv)

Evidence this session: all seven GRIN endpoints **ABSENT**, so a no-dotenv
create cannot merge a remote `GRIN_GOODS_EVIDENCE_FUNCTIONS=true`. If any
later exists, this command **aborts** (remote merge would preserve gate-on).

```bash
cd /path/to/vyaamikk-diary
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs gate-off-initial
```

That is a rebuild/create of exactly:
`functions:grinRegisterGoodsReceipt,functions:grinReconcileCommand,functions:grinMutateGoodsReceipt,functions:grinReadGoodsReceipt,functions:grinReserveEvidence,functions:grinBeginEvidenceUpload,functions:grinUploadEvidence`
from pinned application `5d5df3d`, region `asia-south1`, codebase `default`.
Not config-only. Identity/billing functions stay outside `--only`.

### 6.3 Enable / disable callables (A) — Firebase dotenv **blocked**

Supported alternative for review (still a Functions **revision**, not
Cloud Run console): `gcloud functions deploy NAME --gen2 --region=asia-south1
--project=vyaamikk-diary --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true`
(or `=false` for disable), **without** `--source`.

Official gcloud `--source` omitted: GCS/repo origin leaves source unchanged;
local-path origin uploads **cwd**. The tool **describes origin first** and
aborts unless `gcs` or `repo`. `--set-env-vars` / `--clear-env-vars` /
`--source` are rejected. That updates **only** the gate key and preserves
other user env **per endpoint**, including when endpoints differ.

```bash
# later authorization only; apply host needs gcloud
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs enable
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs disable
```

Live enable/disable re-inspects the seven endpoints first (no fixture). Not
authorized now. This workstation has no `gcloud`.

Post-operation: `inspect` again; confirm seven `gate=on|off` only. Do not
dump env.

---

## 7. Disablement surfaces (keep separate)

| ID | Intent | Method |
|---|---|---|
| **A** | Stop callable processing | §6.3 `disable` (gate not `"true"`). Does not cancel in-flight calls. Does not stop Storage PUT of an already-reserved original while admission is still allow. Stops callable read/reconcile. |
| **B** | Stop new client Storage uploads | Separately authorized `newCommands: "deny"` on exact `users/{uid}/goodsEvidenceAdmission/runtime`. Owner supplies UIDs. |
| **C** | Preserve receipts, serials, originals | Do nothing destructive. |

---

## 8. First-apply order (each step its own later approval)

1. Re-inspect; confirm seven still absent and Rules hashes still match §5.
2. Isolated Firestore then Storage Rules (§4).
3. `gate-off-initial` (§6.2).
4. Seed named testers (not this packet).
5. `enable` (§6.3) only when smoke is authorized.
6. Synthetic data only.

---

## 9. Not started / unset

Internal-GRIN EAS AAB not started. versionCode 23 unreserved. Public
pricing, caps, deletion/GRIN retain-or-purge, encrypted backup, billing,
Play, `main` merge: unset.

---

## 10. Smallest next owner approval

**No live mutation is requested now.**

The smallest later **single** approval, if granted separately: isolated
**Firestore Rules** deploy only (`--config` proposed-grin
`firebase.rules-only.json --only firestore:rules --project vyaamikk-diary`),
against the no-drift 2026-10-06 export. Not Storage, not Functions, not
enablement, not admission, not EAS/Play/billing/`main`.

STOP.
