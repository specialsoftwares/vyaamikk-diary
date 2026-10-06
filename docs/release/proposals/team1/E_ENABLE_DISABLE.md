# Operation E — gate enable / disable (reviewed procedure)

**Not authorization. Not live-executable.** This file does not set
`GRIN_OPS_ALLOW_LIVE`. Do not deploy. Do not install gcloud solely to hit
production. Do not enable live GRIN to obtain preservation evidence.

This is a **billing-off** Internal GRIN restricted-pilot procedure. Restricted
Play billing is **not** a prerequisite. Do **not** call this
payment-tested or public-ready. P8 remains **FAIL**
(`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`). Do not flip that flag.

---

## SOURCE/STUB vs LIVE

| Layer | Status | What it is |
|---|---|---|
| **SOURCE** | **Supported procedure** | Official gcloud `functions deploy` docs + helper construction. Omitted `--source` on an **existing** function previously deployed from GCS or a source repository is documented as leaving source unchanged. `--update-env-vars` updates listed keys only. |
| **STUB** | **PASS** (helper tests + this packet’s smoke SOURCE tests) | Injected `GCLOUD_BIN` / fixtures. Proves argv, origin refuse, dotenv block, UNKNOWN refuse, unrelated-key **object** transform. Does **not** spawn real gcloud. |
| **LIVE** | **HOLD — not executable** | `gcloud` **ABSENT** on this apply host. Seven GRIN names **ABSENT** live. LIVE firebase-created gen2 preservation is **UNPROVEN**. Official docs do **not** make that LIVE case proven. |

Do **not** collapse SOURCE/STUB into LIVE. Do **not** mark E live-executable.

C–F missing inputs stay **HOLD**. E cannot run until **after C** (all seven
PRESENT). C has not run.

---

## Exact source / artifact

| Item | Value |
|---|---|
| Application checkpoint | `540e07aa07f376716484adb879ce66cb9fb170ce` |
| CI-tested checkout | `7e0d629023198333ed384ae076285925e98047d6` (parent `d4c7ed4cb49d1bb5547fe3738702016bd1bcc36f`) |
| `540e07a`..`7e0d629` on `DEPLOYMENT_PATHS` | **empty** |
| Canonical CI | GHA **`37445383607` SUCCESS**, job **`112208918347` `verify`** |
| T5 | `docs/release/proposals/team5/REVIEW_540e07a.md` `b3b1c97` SOURCE+INJECTED **PASS** |
| P8 | **FAIL** (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`) |
| Project | `vyaamikk-diary` |
| Region | `asia-south1` |
| Helper (canonical; coordinator pin) | Combined `docs/release/packets/grin-ops/grin-functions-op.mjs` `PINNED_APP_SHA=540e07a`. **Do not rewrite.** Team 1 does not apply pins. |
| This worktree helper | still `5d5df3d…` — **not rewritten**. Enable/disable argv construction matches combined. Combined is the pin source of truth. |
| firebase-tools | **14.20.0** (`firebase --version`) |
| `gcloud` | **ABSENT** on this host → **LIVE HOLD** |
| GRIN seven live | **ABSENT** → E cannot run until after **C** |
| Env key | `GRIN_GOODS_EVIDENCE_FUNCTIONS` (`GATE_KEY`) |
| On | exact `"true"` (`grinFunctionsEnabled`) |
| Off | `"false"` / missing / `"TRUE"` / `"1"` / other |

Seven names, helper order (`GRIN_FUNCTIONS`):

```text
grinRegisterGoodsReceipt
grinReconcileCommand
grinMutateGoodsReceipt
grinReadGoodsReceipt
grinReserveEvidence
grinBeginEvidenceUpload
grinUploadEvidence
```

Official SOURCE citation (omitted `--source`; **not** LIVE proof):
[gcloud functions deploy](https://cloud.google.com/sdk/gcloud/reference/functions/deploy)

> If you do not specify the `--source` flag: … If the function was previously
> deployed using a Google Cloud Storage location or a source repository, then
> the function's source code will not be updated.

`--update-env-vars` is grouped opposite `--set-env-vars` / `--env-vars-file` /
`--clear-env-vars` (those **remove all** existing user env first). That is
**SOURCE documentation**. It does **not** prove LIVE preservation on a
**firebase-created** gen2 callable (firebase staging `storageSource` is not
the same question as “previously deployed using a GCS location or source
repository” in gcloud’s own sense).

---

## Preservation of unrelated env / config

Cite combined helper (read-only). Line numbers from that file this session:

| Guard | Helper | Behavior |
|---|---|---|
| One-key object transform | `applyGcloudGateUpdate` (~161–169) | `{ ...existingEnv }` then set/delete **only** `GATE_KEY`. Unrelated keys and per-endpoint differences stay. **Pure object spread — not a live gcloud run.** |
| Unsafe argv refuse | `gcloudArgsUnsafe` (~229–236) | Rejects `--source` / `--source=` / `--set-env-vars` / `--set-env-vars=` / `--clear-env-vars`. `runGcloudGate` aborts if constructed argv is unsafe. |
| Origin allow | `gcloudUpdateAllowed` / `assertAllPresentForGateUpdate` (~183–185, ~398–414) | Inspect `sourceOrigin` must be **`gcs` or `repo`**. `local` / `unknown` / missing → refuse (cwd upload risk). |
| Presence | `assertAllPresentForGateUpdate` | All seven **PRESENT**. Any **UNKNOWN** or **ABSENT** refuses enable/disable. Incomplete inventory is UNKNOWN, not absent. |
| Firebase dotenv | `firebaseDotenvWouldReplaceExisting()` always `true`; `GRIN_OPS_METHOD=firebase-dotenv` aborts (~1066–1076) | **BLOCKED.** firebase-tools **14.20.0** `inferDetailsFromExisting` with `usedDotenv=true` **replaces** user env on selected endpoints (remote-only keys dropped). |
| Direct Cloud Run env edit | — | **Forbidden.** |

STUB-proven (combined `grin-functions-op.test.mjs`, not LIVE):

- “gcloud transform preserves unrelated keys and per-endpoint differences”
- “successful simulated enable issues seven gcloud updates without `--source`”
- “firebase-dotenv method is blocked with zero deploy calls”
- “local source origin blocks gcloud env update”
- HTTP/malformed/shape/pagination inventory is UNKNOWN and does not deploy

Inspect `sourceOrigin=gcs` from v2 `storageSource.bucket` **allows** the helper
loop. It is **not** LIVE proof that omitted-`--source` gcloud will treat a
firebase-created staging zip as reusable GCS origin.

---

## Exact enable operation (NOT run; LIVE HOLD)

Preconditions (all required; currently **unmet**):

1. Owner letter for **E** (separate from A–D).
2. **C** completed: all seven **PRESENT**, gate off, inspect complete (not UNKNOWN).
3. Apply-host `gcloud` **present**; record `gcloud version` (helper does not pin it).
4. firebase-tools **14.20.0**.
5. Inspect `sourceOrigin` is `gcs` or `repo` for **all seven**.
6. No CLI dotenv under `functions/`.
7. Clean `DEPLOYMENT_PATHS` vs pinned application `540e07a`.
8. LIVE preservation **proven** on a scratch/non-prod firebase-created gen2
   function (not the seven GRIN names). **Not proven today.**
9. `GRIN_OPS_ALLOW_LIVE=1` only after the owner letter. Never with pin/fixture/
   HTTP-stub/test-hang overrides.

Today: `gcloud` ABSENT = **LIVE HOLD**. Seven ABSENT = E cannot run until after C.

Helper command (would-run later; **not live-executable today**; do not run):

```bash
unset GRIN_OPS_PINNED_SHA GRIN_OPS_EXPORT_DIR PINNED_APP_SHA
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs enable
```

`main` `enable` calls `runGcloudGate(cwd, fixture, "true", "enable")`.
For each name in `GRIN_FUNCTIONS` order, `buildGcloudGateArgs(name, "true")`
constructs:

```text
gcloud functions deploy NAME --project=vyaamikk-diary --region=asia-south1 --gen2 --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true
```

Constructed argv (array form; no `--source`):

```text
["functions", "deploy", NAME, "--project=vyaamikk-diary", "--region=asia-south1", "--gen2", "--update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true"]
```

STUB equivalent (injected binary only; **not** live):
`GRIN_OPS_ALLOW_LIVE=stub` plus absolute `GCLOUD_BIN` and a complete
PRESENT/`gcs` fixture. Used in helper tests. Do not point `GCLOUD_BIN` at
real `gcloud`.

---

## Exact disable operation (NOT run; LIVE HOLD)

Helper wired path uses **`false`**, not remove.
`main` `disable` calls `runGcloudGate(cwd, fixture, "false", "disable")`.

Would-run later (**not live-executable today**; do not run):

```bash
unset GRIN_OPS_PINNED_SHA GRIN_OPS_EXPORT_DIR PINNED_APP_SHA
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs disable
```

Constructed argv:

```text
["functions", "deploy", NAME, "--project=vyaamikk-diary", "--region=asia-south1", "--gen2", "--update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=false"]
```

Same seven names, same order, same omitted-`--source` constraint, same origin
and UNKNOWN refuses.

`buildGcloudGateArgs(name, null)` would emit
`--remove-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS`. That argv is **not** what
helper `disable` runs. `--remove-env-vars` is an allowed later rollback **only
after** the same omitted-`--source` LIVE preservation is proven. Do not run
remove as a shortcut around unproven gcloud.

Disable does **not** cancel in-flight calls and does **not** stop Storage PUT
of an already-reserved original while D admission is still `allow`. Callable
disable ≠ Storage-upload disable ≠ data delete.

---

## Post-operation readback (never dump secrets)

Re-run inspect **without** `GRIN_OPS_EXPORT_DIR` (unless recording a new
approved baseline):

```bash
unset GRIN_OPS_ALLOW_LIVE GRIN_OPS_PINNED_SHA GRIN_OPS_EXPORT_DIR PINNED_APP_SHA
node docs/release/packets/grin-ops/grin-functions-op.mjs inspect
```

`printInspect` reports gate **on/off by key presence / exact-name test only**:

```text
NAME PRESENT origin=gcs|repo gate=on|off other_user_keys=N secrets=N
```

| Readback | How | Forbidden |
|---|---|---|
| Gate | `gate=on` iff `GATE_KEY` value is exact `"true"` (`summarizeEndpointEnv.gateOn`). `"false"` / absent → `gate=off`. | Printing the env value, tokens, dotenv, or secret payloads |
| Gate key presence | `gatePresent` (hasOwnProperty) — name only | Dumping `environmentVariables` |
| Other user keys | `other_user_keys=<count>` must be unchanged across enable/disable | Printing key names that are not `GATE_KEY` if they could be secrets; never print values |
| Secrets | `secrets=<count>` (`secretBindingCount`) unchanged | Printing secret names/values/versions |
| Origin | `origin=` must remain `gcs` or `repo` | Treating v2 `storageSource.bucket` as original provenance |
| Unrelated | `unrelated_functions` count and id set unchanged (last recorded **39**) | “Fixing” unrelated functions |
| Values | — | `gcloud functions describe` env dumps; Cloud Run YAML with env; `firebase functions:config:get` |

After **enable**: all seven `gate=on`. After **disable**: all seven `gate=off`.
Mixed `gate=on`/`off` is **not** success.

---

## Stop conditions

Stop. Do not continue the loop. Do not dotenv-fix. Do not Cloud Run-edit.

- E is **not live-executable** (current): preservation LIVE UNPROVEN; `gcloud`
  ABSENT; seven ABSENT (C not done)
- Inspect UNKNOWN / incomplete inventory / HTTP 401/403/500 / malformed JSON /
  bad list shape / interrupted pagination
- Mixed PRESENT/ABSENT
- Any of the seven `sourceOrigin` not `gcs`/`repo`
- CLI dotenv present (`.env`, `.env.vyaamikk-diary`, `.env.production`,
  `.env.local` under `functions/`)
- `GRIN_OPS_METHOD=firebase-dotenv`
- firebase-tools ≠ **14.20.0**
- Live overrides (`GRIN_OPS_PINNED_SHA`, fixtures, HTTP stubs, test-hang,
  `FIREBASE_BIN`, `GCLOUD_BIN`) together with `GRIN_OPS_ALLOW_LIVE=1`
- Pin / dirty `DEPLOYMENT_PATHS` vs `540e07a`
- Mid-loop non-zero gcloud status (below)
- Unrelated count/id set changed
- Post-op inspect dumps env values (operator error — stop and redact)

---

## Rollback

### Mixed-gate is NOT rolled back

`runGcloudGate` updates names **one-by-one**. First non-zero status throws.
Already-updated names **stay** updated. Temp session journal is **deleted** in
`finally`. Record state by **inspect**, not by assuming PASS or ROLLBACK.

Example: enable fails on the 4th name → names 1–3 may be `gate=on`, names 4–7
`gate=off` or unchanged. That is **mixed gate**, not a rollback. **Stop.**
Inspect. Do not claim rolled back. Do not re-run `gate-off-initial`. Do not
firebase-dotenv “to fix”. Do not `--clear-env-vars`.

Until LIVE preservation is proven, mixed-gate recovery is a **separate packet**.
In-scope recovery **after** LIVE proof: helper `disable` on names that are
PRESENT **and** `gate=on` (same omitted-`--source` argv).

### Mid-loop stop

Do not resume the same `enable`/`disable` invocation blindly. Inspect each of
the seven. A later lettered resume must name the remaining PRESENT/`gcs|repo`
functions explicitly in a new packet. Helper has no mixed-gate resume command.

### Disable after successful enable

Only after LIVE preservation is proven **and** an owner letter:

1. Helper `disable` → `--update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=false`
2. Optional later: proven `--remove-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS`
   (absent key = off)

Same omitted-`--source` constraint. Leave the seven **PRESENT**. Do not
Editor-delete receipts, serials, or Storage originals. D admission deny is a
**separate** D rollback.

Create-succeeded / enable-not-done (C success): leave seven PRESENT, gate off.
That is **not** an E rollback.

---

## What this procedure does **not** grant

- Live `enable` / `disable` / `gate-off-initial`
- Installing gcloud to experiment on `vyaamikk-diary`
- Scratch proof **on** the seven GRIN names
- `PLAY_BILLING_TESTER_UIDS` (empty / fail-closed; **not** GRIN admission)
- EAS, Play, billing activation, `INCLUDE_GRIN_IN_ACCOUNT_PURGE` flip
- F `LIVE_BACKEND` (refused until E LIVE proven **and** a separate owner
  live-smoke letter)
- A second live tester account (T1/T2 unnamed). INJECTED `cross_owner_denial`
  uses synthetic OTHER. Live cross-account cases **require a second
  authenticated user** and stay HOLD until that account is named privately.
