# Firebase CLI 14.20.0 — supported GRIN enable/disable method (SOURCE)

Not live proof. `applyGcloudGateUpdate` remains a pure helper. This note is
from the **installed** CLI at
`$(dirname $(which firebase))/../lib/node_modules/firebase-tools`
(`package.json` `"version": "14.20.0"`) plus an in-process call of
`inferDetailsFromExisting` (no `firebase deploy`).

CLI on this host: `firebase --version` → **14.20.0**.
`gcloud` on this host: **not installed**.

## Exact supported methods

| Phase | Method | Evidence |
|---|---|---|
| Initial create, gate **off** | `firebase deploy --project vyaamikk-diary --non-interactive --only` the seven `functions:grin*` names. **No dotenv.** Helper command `gate-off-initial`. | Argv + stub tests on the unchanged guard tool. Live create **not executed**. |
| Later enable / disable | `gcloud functions deploy NAME --gen2 --region=asia-south1 --project=vyaamikk-diary --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true\|false` **without** `--source`, only after inspect shows origin `gcs` or `repo`. | Helper argv is stub-proven. **gcloud omitted-`--source` preservation on a firebase-created gen2 callable is UNPROVEN.** Do not enable live GRIN to obtain that evidence. |
| Firebase dotenv enable/disable | **Blocked.** | SOURCE below. |

Do not treat a v2 `storageSource` bucket as original provenance (GCF staging zip after firebase create).

## `inferDetailsFromExisting` (installed `prepare.js` 197–217)

Called from `prepare()` with
`codebaseUsesEnvs.includes(codebase)` where `codebaseUsesEnvs` is pushed when
`hasUserEnvs(userEnvOpt) || hasEnvsFromParams` (`prepare.js` 121–123, 173).

`hasUserEnvs` (`lib/functions/env.js` 157–160): true if any of `.env`,
`.env.{projectId}`, `.env.{alias}` exist under the functions source
(`.env.local` only when `isEmulator`).

For each wanted endpoint:

1. If the endpoint **does not exist** remotely (`!haveE`): `continue`. Want env
   is left as packaged (Firebase-injected keys only when no dotenv). Gate key
   absent ⇒ `grinFunctionsEnabled` is false. That is gate-off **create**.
2. If it exists and `usedDotenv` is **false**:
   `wantE.environmentVariables = { ...haveE.environmentVariables, ...wantE.environmentVariables }`
   → remote user env is **merged**, then local/want keys overlay. A later
   firebase re-deploy of an existing GRIN name **without** dotenv can
   **preserve** `GRIN_GOODS_EVIDENCE_FUNCTIONS=true`. That is why
   `gate-off-initial` refuses any PRESENT name.
3. If it exists and `usedDotenv` is **true**: the merge is **skipped**. Loaded
   dotenv plus Firebase-injected keys become the env set. Remote keys not in
   dotenv are **dropped**. That is **replace**, not update-one-key.

In-process confirmation (not live deploy):
`node --test docs/release/proposals/team1/firebase-tools-14.20.0-infer-details.test.mjs`

## Remaining uncertainty (HOLD)

- Real `gcloud functions deploy --gen2 --update-env-vars` without `--source` on
  a **firebase-created** gen2 callable: source archive, secrets, ingress,
  runtime SA, unrelated user keys. Official docs cover GCS/repo vs local
  origin; they do not prove firebase-CLI staging `storageSource` is treated as
  GCS origin by gcloud.
- Scratch/non-prod function created the same way as GRIN remains the evidence.
  Do not execute A6 to obtain it.
