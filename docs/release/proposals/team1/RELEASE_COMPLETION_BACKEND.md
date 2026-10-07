# Team 1 findings — Internal GRIN backend / config / ops

Status: **reviewable**. Not authorization. Not live deploy. Not tooling CI.
Not a rewrite of `docs/release/packets/grin-ops/grin-functions-op.mjs`.

| Pin | Value |
|---|---|
| Worktree | `/Users/shivamsaurav/vyd-worktrees/grin-combined` |
| HEAD (tooling) | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` |
| Application SHA | `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` |
| Application tree vs pin | `git diff --stat 5d5df3d… -- functions src eas.json app.json app firebase.json` **empty** this session |
| firebase-tools on this host | **14.20.0** (`firebase --version`) |
| gcloud on this host | **not installed** |
| `GRIN_OPS_ALLOW_LIVE=1` | **not set against live cloud** (HOLD) |

Ops-guard HTTP 403 / pagination / fixture / live-override findings are **not reopened**. No new reproduction.

---

## 1. Exact supported live enable / disable method

### 1.1 Firebase dotenv — blocked (replace, not merge)

firebase-tools **14.20.0** `prepare.js`:

- `loadUserEnvs` + `hasUserEnvs` (`lib/functions/env.js`) load `.env`, `.env.{projectId}`, `.env.{alias}` (and `.env.local` in emulator).
- `codebaseUsesEnvs` is true when `hasUserEnvs(userEnvOpt) || hasEnvsFromParams` (`prepare.js` ~121–123).
- `inferDetailsFromExisting(want, have, usedDotenv)` (`prepare.js` 197–217):
  - If the endpoint **already exists** and `usedDotenv` is **false**:  
    `wantE.environmentVariables = { ...haveE.environmentVariables, ...wantE.environmentVariables }`  
    → remote user env is **merged**, then local/want keys overlay.
  - If `usedDotenv` is **true**: that merge is **skipped**. Loaded dotenv (plus Firebase-injected `FIREBASE_CONFIG` / `GCLOUD_PROJECT` / `EVENTARC_CLOUD_EVENT_SOURCE`) becomes the env set for selected endpoints. Remote keys **not** in dotenv are **dropped**. That is **replace**, not update-one-key.

A single-key dotenv is therefore **not** an approved general enable/disable method. The helper hard-blocks it:

- `firebaseDotenvWouldReplaceExisting()` always `true` (`grin-functions-op.mjs:171–174`)
- `main` `enable`/`disable` abort when `GRIN_OPS_METHOD=firebase-dotenv` (`:1066–1076`)
- Stub-proven: `grin-functions-op.test.mjs` “firebase-dotenv method is blocked…”

`assertAllAbsent` comment (`:390–393`) is the matching create-time reason: a later firebase **re**-deploy of an existing endpoint **without** dotenv would **merge** remote env and could preserve `GRIN_GOODS_EVIDENCE_FUNCTIONS=true`.

### 1.2 Initial CREATE (gate-off) — firebase seven-only, no dotenv

**Recommended method (a):** `node docs/release/packets/grin-ops/grin-functions-op.mjs gate-off-initial`

What it actually runs (`runGateOffInitial` `:537–568`):

- Prechecks: repo root, pinned application SHA `5d5df3d…`, clean deployment inputs, **no** CLI-loadable dotenv (`precheckMutating` `:530–535`).
- Requires **all seven ABSENT** (`assertAllAbsent` `:383–396`). Any PRESENT / UNKNOWN / incomplete fixture aborts **before** spawn.
- Live mode: `firebase --version` must be exactly `14.20.0` (`assertReviewedFirebaseCli` `:503–508`).
- One `firebase deploy --project vyaamikk-diary --non-interactive --only functions:grinRegisterGoodsReceipt,…` (`buildFirebaseSevenOnlyArgs` `:187–197`). Not `--only functions`. Not `--source` on firebase (firebase packages `functions/`).

For **new** endpoints `inferDetailsFromExisting` hits `if (!haveE) continue` (`prepare.js` 201–203). There is no remote user env to merge. Want env is Firebase-injected keys only. Gate key **absent** ⇒ `grinFunctionsEnabled` is false (`callables.ts:29–31`). That is gate-off create.

**Proven (stub / source, not live):** argv is exactly seven `functions:grin*` names; existing dotenv / dirty tree / wrong pin / existing remote name abort with zero deploy spawn (`grin-functions-op.test.mjs`).

**Unproven:** a real firebase create on `vyaamikk-diary`. Not executed.

### 1.3 Later enable / disable — gcloud `--update-env-vars`, no `--source`

**Recommended method (b):** `grin-functions-op.mjs enable` / `disable` (default `GRIN_OPS_METHOD=gcloud-update-env-vars`).

What it actually runs (`runGcloudGate` `:570–597`, `buildGcloudGateArgs` `:212–227`):

```
gcloud functions deploy NAME --project=vyaamikk-diary --region=asia-south1 --gen2 \
  --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true|false
```

(`disable` uses `=false`; helper can also `--remove-env-vars` when `gateValue === null`, but `main` passes `"false"` / `"true"` only.)

Unsafe argv rejected (`gcloudArgsUnsafe` `:229–236`): `--source`, `--set-env-vars`, `--clear-env-vars`.

Requires **all seven PRESENT** and origin `gcs` or `repo` (`assertAllPresentForGateUpdate` `:398–414`, `gcloudUpdateAllowed` `:183–185`). Local origin aborts (cwd upload risk).

Official gcloud `functions deploy` (this session, Cloud SDK reference):

- `--set-env-vars` / `--env-vars-file` / `--clear-env-vars`: **remove all existing** user env first.
- `--update-env-vars`: listed keys only; grouped as the non-replace alternative. `--remove-env-vars` may combine with it.
- If `--source` is **omitted**:
  - **new** function → current directory is uploaded;
  - previously deployed from **local filesystem** → cwd uploaded again;
  - previously deployed from **GCS** (`gs://`) or **source repo** (`https://`) → source **not** updated.

### 1.4 Proven vs unproven — `applyGcloudGateUpdate` is not a deploy

`applyGcloudGateUpdate` (`grin-functions-op.mjs:161–169`) is a **pure object spread**. Stub test “gcloud transform preserves unrelated keys…” (`grin-functions-op.test.mjs:142–155`) proves **that helper**, not gcloud.

| Claim | Status |
|---|---|
| Helper argv has `--gen2`, `--update-env-vars=GATE=…`, no `--source` | **Stub-proven** (`grin-functions-op.test.mjs` “successful simulated enable…”) |
| Tool refuses local origin, `--set-env-vars`, dotenv method | **Stub-proven** |
| Official gcloud docs: `--update-env-vars` does not clear other keys; omitted `--source` leaves GCS/repo source | **Documented** |
| A real `gcloud functions deploy --gen2 --update-env-vars` on a **firebase-created** gen2 callable preserves source archive, secrets, ingress, runtime SA, and unrelated keys | **UNPROVEN** (gcloud absent here; HOLD forbids live enable to obtain evidence) |
| Gen2 env update creates a **new Cloud Run revision** even when source is unchanged | Expected; not observed here |

Do **not** execute live enablement on the seven GRIN names to obtain that evidence. A later **scratch** function (non-prod or explicitly owned throwaway), created the same way as GRIN (`firebase deploy --only functions:NAME` then `gcloud … --update-env-vars` without `--source`), is the evidence still required.

### 1.5 Do not infer original provenance solely from `storageSource`

`sourceFromV2Function` (`grin-functions-op.mjs:661–670`) maps `buildConfig.source.storageSource.bucket` → origin `gcs`, `repoSource` → `repo`, else `unknown`.

After **any** firebase CLI gen2 deploy, Cloud Functions stores the uploaded zip as `storageSource`. That is GCF’s staging archive, **not** proof the operator originally passed `--source=gs://…`. firebase-tools also writes labels `firebase-functions-codebase` / `firebase-functions-hash` (`firebase-tools` `constants.js`).

gcloud’s omitted-`--source` branch is “how this function was **previously deployed** (local vs GCS vs repo)”, which is **not** the same question as “does the v2 API currently show a `storageSource`?”. After `gate-off-initial`, inspect will almost certainly report `origin=gcs` and **allow** enable. Whether gcloud then leaves that archive in place or uploads **cwd** is the unproven preservation risk.

### 1.6 How to verify (post-op; no env dumps)

| Check | How | Notes |
|---|---|---|
| Firebase CLI | `firebase --version` must be `14.20.0` | Live `gate-off-initial` enforces this. **`enable`/`disable` do not pin gcloud or firebase version** (`runGcloudGate` `:570–574`). Apply host must record `gcloud version` separately. |
| Runtime identity | `inspect` `runtime_sa` (probe `mintClientAuthToken`) **and** each of the seven `serviceConfig.serviceAccountEmail` | First firebase create does **not** set `serviceAccount` on `wrapGrin` (`productionExports.ts:85–90`). Default is Compute default SA. Do not assume the seven match the probe until read back. |
| Secrets | `inspect` `secrets=<count>` only (`printInspect` `:1014`). `secretKeys` are collected (`:656`) but **not** printed | After enable/disable, `secretBindingCount` must be unchanged. Do not print secret names/values. |
| Ingress | **Not** in current `inspect` report | Read `serviceConfig.ingressSettings` (or `gcloud functions describe --gen2`) before/after. Callable default is public HTTPS; do not change it only on GRIN. |
| Gate | `inspect` `gate=on\|off` | `gateOn` is exact `"true"` (`summarizeEndpointEnv` `:335–341`). `"false"` / missing / `"1"` / `"TRUE"` are off. |
| Other user keys | `other_user_keys=<count>` | Count must be unchanged across enable/disable. Values never printed. Firebase injects `FIREBASE_CONFIG`, `GCLOUD_PROJECT`, `EVENTARC_CLOUD_EVENT_SOURCE`. |
| Unrelated revisions | Today: `unrelated_functions=N` + sorted ids (`:1020`, `:927–928`). **No** per-unrelated Cloud Run revision / `firebase-functions-hash` | Before mutate: snapshot the 39 ids + hashes/revisions. After: same ids; GRIN revisions may change; **unrelated must not**. |
| Source | Do not treat `storageSource.bucket` as original provenance | Record `buildConfig.source` object **and** labels `firebase-functions-hash` / codebase. After env-only update, hash/source generation should match pre-op if source was truly unchanged. |

### 1.7 Rollback (Functions)

| Situation | Rollback | Forbidden |
|---|---|---|
| Gate-off create succeeded; enable not yet done | Leave gate off. Callables exist and deny. | Delete the seven; delete data |
| Enable succeeded | `disable` (gate `false`) — surface **A** | `--clear-env-vars`; firebase dotenv; object delete |
| Partial enable (see §2) | `disable` the names that are PRESENT+gate-on; do not re-run full `gate-off-initial` | Blind seven-create |

---

## 2. Partial deployment

### Current helper

**Create** (`runGateOffInitial`): one firebase spawn of all seven. Precondition: **all absent**. Mixed presence (some of the seven already exist) → `assertAllAbsent` aborts (`:390–393`). Zero firebase spawn. There is **no** “create the missing four only” path.

**Enable/disable** (`runGcloudGate`): sequential `for (const name of GRIN_FUNCTIONS)` (`:583–591`). First non-zero status throws. Names **already updated in that loop stay updated**. Session dir (including `argv.log`) is **cleaned in `finally`** (`:592–594`, `:315–321`). No durable succeeded-name / revision journal.

**Inspect after a failed firebase seven-deploy:** likely mixed PRESENT/ABSENT. Then:

- `gate-off-initial` refuses (PRESENT exists; merge would keep remote gate).
- `enable`/`disable` refuse (not all PRESENT).

That is a **stuck** state with no helper resume.

Stub coverage: all-present blocks create (`grin-functions-op.test.mjs` “existing remote GRIN endpoint…”; “later inventory page with existing GRIN function…”). There is **no** stub test for mixed 3 PRESENT + 4 ABSENT (behavior follows `assertAllAbsent` / `assertAllPresentForGateUpdate` as written).

### Smallest proposed addition (do **not** implement in the combined tree)

1. Operator-supplied durable journal dir (`GRIN_OPS_JOURNAL_DIR`), **not** the cleaned `grin-ops-*` temp.
2. After each successful child (firebase reports endpoint done, or each gcloud name): append one JSON line `{op, name, presence, revision_if_known, firebase_hash_if_known, at}` — **no env values**.
3. `gate-off-initial`: if inspect is mixed, abort with the PRESENT name list and **refuse** another full seven `--only`. Do not re-create PRESENT names (remote env merge). A later **explicit** `create-absent-only` (separate command, same no-dotenv, same pin) may target ABSENT names only after owner approval.
4. `enable`/`disable`: on mid-loop failure, keep the journal; retry remaining names only; re-inspect; do not claim PASS.

---

## 3. Rules apply-time (hashes this session)

Isolated config is **undeployed**. Repo-root `firebase.json` still points at quota Rules (`firebase.json:5–10`). Isolated JSON has **no** `functions` key (`docs/release/rules-compat/proposed-grin/firebase.rules-only.json`).

| Artifact | sha256 (this session `shasum -a 256`) |
|---|---|
| Isolated config `docs/release/rules-compat/proposed-grin/firebase.rules-only.json` | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Merged Firestore `proposed-grin/firestore.rules` | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Merged Storage `proposed-grin/storage.rules` | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` |
| Live Firestore baseline export `live-export-2026-10-06/firestore.rules` | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| Live Storage baseline export `live-export-2026-10-06/storage.rules` | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` |
| **Do not deploy** repo-root `firestore.rules` (quota) | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` |
| **Do not deploy** repo-root `storage.rules` | `19fcc761dc8d5a923efb45ed589a598690bd3bb2159fab827f3ce30c17a60452` |

Live ruleset IDs from `live-export-2026-10-06/META.json` (2026-10-06 inspect; not a forever-rollback target):

- Firestore release `cloud.firestore` / ruleset `a19b4a83-8b3e-4cf5-b8b8-e8d26e9704f9`
- Storage release `firebase.storage/vyaamikk-diary.firebasestorage.app` / `a2a0ddf7-9746-4dd2-bd48-29c9abc0e41f`

Packet `INTERNAL_GRIN_DEPLOYMENT_PACKET.md` §3–§4 / §10 matches these hashes.

### Recheck at apply time

1. `inspect` (read-only). Confirm Firestore/Storage sha256 still equal the **fresh** export, not a remembered October 1 ID.
2. If drift vs `live-export-2026-10-06/`, **stop**. Re-merge; do not apply the old merged files.
3. Deploy **only** via `--config docs/release/rules-compat/proposed-grin/firebase.rules-only.json` from repo root. Paths in that JSON are relative to **that directory**.
4. `--only firestore:rules` (Firestore-only owner approval) **or** later `--only storage` separately. Never `--only firestore` (indexes). Never repo-root `firebase deploy` (would publish quota `233b05b7…` and functions).
5. Immediately re-export; merged Firestore live sha256 must equal `551203b8…`; Storage `6b895992…` only after Storage apply.
6. Rollback: isolated config pointed at `live-export-2026-10-06/` files (roll **forward** to those bytes). Do not delete receipts/serials/objects.

**Firestore-only is an independent owner approval** (`INTERNAL_GRIN_DEPLOYMENT_PACKET.md` §10). It does not authorize Storage, Functions, enablement, admission, EAS, Play, billing, or `main`.

---

## 4. Runtime privilege

See `GRIN_RUNTIME_IDENTITY_PROPOSAL.md`. Do **not** change `982505811909-compute@developer.gserviceaccount.com` (`roles/editor`). IAM writes require later approval.

---

## 5. Auth / admission coverage

See `AUTH_ADMISSION_COVERAGE.md`. Production path is `productionExports.ts` → lazy `productionCompose.ts` → `composed.ts` + packaged G1/G2 adapters. `callables.ts` `handleGrin*` stubs are **not** the live backend (`packaging.unit.test.ts`).

---

## 6. Remaining approval requirements (none requested now)

HOLD — each is a **separate** later owner approval:

1. Isolated Firestore Rules apply (packet §10).
2. Isolated Storage Rules apply.
3. `GRIN_OPS_ALLOW_LIVE=1` + `gate-off-initial` (seven-function create, gate off).
4. Scratch/non-prod evidence that gcloud `--update-env-vars` without `--source` preserves source/secrets/ingress/SA/other keys on a **firebase-created** gen2 function (not live GRIN enable).
5. Tester admission Admin writes (named UIDs only).
6. `enable` (surface A) when synthetic smoke is authorized.
7. Synthetic smoke (after approved deploy).
8. `disable` / admission `newCommands=deny` (B) / no data delete (C) as distinct ops.
9. GRIN-specific runtime SA IAM **writes** (proposal only).
10. Binding that SA on the seven `onCall` options (source change; not this SHA unless coordinator pins it).
11. EAS / Play / billing / `main` merge / Wave 2.

Not claimed: live deploy, live env write, tooling GitHub CI, `ci:verify` as evidence for this tooling SHA.
