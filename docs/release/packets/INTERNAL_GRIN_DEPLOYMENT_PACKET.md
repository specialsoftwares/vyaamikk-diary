# Internal GRIN — actionable deployment packet (source complete)

Not authorization. Do **not** execute live deploy, IAM/Rules writes, admission
seeding, main merge, EAS/native build, OTA, Play writes, or billing
activation from this packet. Encrypted PDF backup stays backlog. Public
pricing, storage caps, and account-deletion/GRIN retention remain **unset**
(Packet D). Internal evidence stays synthetic while retention is unset.

Team 5 independent review (no defects on the seven wiring checks):
`docs/release/proposals/team5/INTERNAL_GRIN_SOURCE_WIRING_REVIEW.md`.
Wave 2 is **not** accepted. Not G6.

---

## 1. Integrated source SHA and validation

| Ref | Value |
|---|---|
| Branch | `integration/grin-g1-g5-source` (draft PR #31) |
| Application SHA | `4409366f0a0862ef18d5825c47dedaae9b7f9f3f` |
| Application parent | `3b030c95a26843a81bb94c67596d1b41185f6119` |
| Merge-base / `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |
| Confirmation-refresh (preserved) | `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` |
| Admin config resolution (preserved) | `4aac867af015d83f6ec3badb0748ff3b4bcc1a22` |
| Canonical CI on this SHA | **record after push** — do **not** reuse `37337067895` or `37330701057` |

Local checks recorded before push (exit 0): `test:goods-evidence`,
`test:goods-evidence-g1-unit`, `test:grin-product`,
`npm --prefix functions run build`, `test:live-rules-grin-merged`,
`test:goods-evidence-g1-functions-emulator` (joined register / evidence /
gates on isolated demo project). Team 5 independently re-ran the four
required unit tests plus merged Rules emulator.

`functions/lib/index.js` (gitignored compile) re-exports the seven names
from `./goodsEvidence/productionExports`. `productionCompose` is loaded only
on the first GRIN invocation.

## 2. Exact seven-function deployment command

Target: Firebase / GCP project **`vyaamikk-diary`** (number `982505811909`),
region **`asia-south1`**, codebase **`default`**, source `functions/`,
entry `functions/lib/index.js`. Storage bucket
**`vyaamikk-diary.firebasestorage.app`**. Do **not** deploy
`tools/goods-evidence-emulator/functions-entry`.

First Functions deploy — **server gate unset** (callables exist, deny):

```bash
firebase deploy --project vyaamikk-diary --only \
functions:grinRegisterGoodsReceipt,\
functions:grinReconcileCommand,\
functions:grinMutateGoodsReceipt,\
functions:grinReadGoodsReceipt,\
functions:grinReserveEvidence,\
functions:grinBeginEvidenceUpload,\
functions:grinUploadEvidence
```

Do **not** set `GRIN_GOODS_EVIDENCE_FUNCTIONS` on this step. `"1"` and
`"TRUE"` remain deny. Smoke after this step: unauthenticated →
`unauthenticated`; authenticated non-seeded uid → `policy_denied`.

Separate enablement (only after Rules + tester seed, separate approval):

```bash
for fn in \
  grinRegisterGoodsReceipt grinReconcileCommand grinMutateGoodsReceipt \
  grinReadGoodsReceipt grinReserveEvidence grinBeginEvidenceUpload \
  grinUploadEvidence
do
  gcloud functions deploy "$fn" \
    --project=vyaamikk-diary \
    --region=asia-south1 \
    --gen2 \
    --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true
done
```

Do not set that env on identity/email/deletion/billing functions.

Global resource options already on this codebase (`cpu: gcf_gen1`,
`concurrency: 1`, `maxInstances: 3`) apply to the new callables. Adding
seven services increases regional CPU reservation; if asia-south1 total-CPU
quota blocks rollout, raise the quota or lower `maxInstances` in a later
approval — do not silently drop identity functions.

## 3. Additive Rules artifacts (undeployed)

`firebase.json` still points at repo-root Rules. Do **not** deploy repo-root
quota `firestore.rules` (`233b05b7…`).

| Artifact | sha256 | Role |
|---|---|---|
| Last live Firestore (2026-10-01) / `docs/release/rules-compat/proposed/firestore.rules` | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` | Merge **base** |
| Last live Storage (2026-10-01) / `docs/release/rules-compat/proposed/storage.rules` | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` | Merge **base** |
| `docs/release/rules-compat/proposed-grin/firestore.rules` | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` | Additive GRIN + live-compat diary/save |
| `docs/release/rules-compat/proposed-grin/storage.rules` | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` | Additive GRIN + letterhead/PDF |

Emulator: `npm run test:live-rules-grin-merged` PASS (diary/save/PDF + GRIN
client-write deny). Not a live deploy.

**Live re-export blocker (this session, one probe, not retried):**
`firebase login:list` still shows `support.vyd@specialsoftwares.com`.
`.firebaserc` alias is `vyaamikk-diary`. `firebase projects:list` failed
(`Failed to list Firebase projects`). No credentials or OTP were requested
in chat. On-disk proposed files still match the 2026-10-01 live hashes.
Re-export from Console/CLI after the owner completes the normal local
reauth, then compare before deploying merged files. Do not overwrite live
from a drifted repo-root copy.

After a successful re-export, deploy order remains Firestore Rules, then
Storage Rules, then Functions (gate off).

## 4. Proposed runtime identity and permissions

Use the **existing** asia-south1 Functions runtime service account (already
serves identity/deletion/billing). Do not commit SA JSON. Do not add
`storage.objects.delete` or `storage.admin` on the first export. Do not add
App Check only on GRIN (existing identity callables are not App Check
enforced).

Firestore Admin access is database-level (`roles/datastore.user` on
`(default)`). It cannot be isolated to GRIN collections. Residual: Admin
can read/write diary and other user documents. Full matrix:
`docs/release/proposals/unapplied/IAM_PERMISSION_MATRIX.md`.

Storage prefix IAM on
`vyaamikk-diary.firebasestorage.app` / `objects/users/` was **not** read
back live (same CLI blocker). Treat it as a pattern to verify on apply, not
as already configured. First export does not require Admin object create;
clients PUT under Storage Rules after reservation.

## 5. Tester admission / ledger (owner-supplied UIDs only)

Do **not** invent Firebase UIDs. Owner supplies tester UIDs privately at
deploy time. Play licence-tester emails are not admission.

For each owner-named uid only:

```
users/{uid}/goodsEvidenceAdmission/runtime
  { "schemaVersion": 1, "newCommands": "allow", "reconciliation": "allow" }

users/{uid}/goodsEvidenceLedgers/{ledgerId}
  { "ownerUid": "{uid}", "status": "active" }
```

Everyone else: omit admission or set both fields to `"deny"`. Client flags
cannot write these documents. Seed **after** the gate-off Functions deploy
and Rules merge, in a separate approval, before synthetic smoke.

Reviewer phone `+91 9000000000` is not GRIN admission unless that Auth uid
is explicitly seeded.

## 6. First deploy vs later enablement vs smoke

1. Re-export live Rules; confirm hashes vs §3 base.
2. Deploy merged Firestore, then merged Storage (separate approval).
3. Deploy the seven functions with the env **unset**.
4. Separate approval: seed named testers; set
   `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` on those seven instances only.
5. Synthetic-data smoke only: unauthenticated deny; non-admitted deny;
   admitted register → one serial, replay same commandId+digest →
   `replayed: true`; reserve → begin → PUT → `grinUploadEvidence` →
   stored-byte `actualSha256`; `grinReadGoodsReceipt`; cross-owner deny;
   `pending_deletion` deny. No production customer data.

## 7. Rollback that preserves receipts, serials, originals

Prefer disable over delete:

1. Unset `GRIN_GOODS_EVIDENCE_FUNCTIONS` (or set any value other than
   `"true"`) on the seven functions. Callables remain exported and deny.
2. If Rules were deployed, roll **forward** to the previous live ruleset
   names (`cloud.firestore` `a19b4a83-8b3e-4cf5-b8b8-e8d26e9704f9` and
   Storage `a2a0ddf7-9746-4dd2-bd48-29c9abc0e41f` as of 2026-10-01) after
   confirming a fresh export. Do not deploy repo-root quota Rules as a
   rollback.
3. Do **not** delete Firestore GRIN documents, serials, or Storage objects
   as rollback. Do not grant or use `storage.objects.delete`.
4. Do not delete the seven functions unless a later approval says so;
   deleting functions does not erase receipts or originals, but it is
   unnecessary if the env is unset.
5. Client: ordinary `production` / `preview` AABs stay GRIN-off. An
   Internal-GRIN AAB can be unpublished from Internal Testing without
   wiping server data.

## 8. Proposed Internal-GRIN AAB (not started)

Profile: `eas.json` `build.internal-grin` (app-bundle, production app mode,
purchase-entry `"0"`, quota-upsell `"0"`, both GRIN visibility flags `"1"`).
Ordinary `production` / `preview` stay GRIN-off.

```bash
# NOT authorized in this assignment
eas build --profile internal-grin --platform android --non-interactive
```

`android.versionCode` is still **23** and is **not reserved**. Recheck the
complete Play bundle list immediately before selecting a code (last
read-only inventory 2026-10-01: Internal Testing vc22 Active; 23 absent).

Remaining before that build (Packet C / T2): device IDs, Android version,
RAM; Play-installed vs USB artefact label; legal date 2026-07-27; diary
save/PDF on upgrade and clean devices; GRIN hub tile only on this profile;
non-admitted account shows unavailable; account change retires the session;
synthetic originals only.

## 9. Owner decision list (unchanged)

- Public GRIN pricing (include in diary plan vs separate SKU vs invite-only).
- Commercial storage caps and over-limit behaviour.
- Account-deletion / pending_deletion purge vs retain of GRIN documents and
  originals. `functions/src/deletion` still has no GRIN paths.
- Encrypted PDF backup (backlog).
- Billing / public Play submission / merge to `main`.

Do not claim a quota or deletion policy has been chosen.

---

STOP. Source wiring, Team 5 review, and this packet are the deliverable.
Live operation requires a later owner approval of each numbered step.
