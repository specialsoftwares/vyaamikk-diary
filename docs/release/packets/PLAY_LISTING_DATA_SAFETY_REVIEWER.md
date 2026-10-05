# Play listing / Data safety / reviewer copy — GRIN-aware, **not submitted**

Status: worksheet against **planned Internal Testing behavior**, not a Console
paste performed here. Do not submit, publish, or Save in Play Console from
this file.

Base reviewer phone copy remains `docs/PLAY_REVIEW_SETUP.md`. This file only
adds GRIN-accurate constraints.

Planned Internal binary (if Packet B §2 is approved): production-profile AAB,
purchase-entry off, GRIN UI visible to that AAB, **server admission only for
seeded tester uids**. If Packet B §2 is **not** approved: GRIN UI stays hidden
on Play-installed builds — listing and reviewer instructions must **not**
claim GRIN.

## Store listing (Internal / draft)

Do **not** claim:

- Live GSTN / GSTR-2B / EWB portal verification
- ITC eligibility or credit claims
- That a pack PDF contains original invoice files (`originalsBundled=false`)
- Encrypted backup of PDFs (backlog)
- That GRIN is included in a priced SKU until Packet D records A or B
- Unbounded evidence storage

Accurate short description addendum **if GRIN is visible on the submitted
build**:

> Goods receipts (GRIN) are an optional internal-testing workflow for recording
> goods received and attaching original PDF/image evidence. Evidence packs are
> summaries; original files stay in app storage. The app does not verify GST
> returns, e-way bills, or ITC eligibility.

If GRIN is **not** visible: omit that paragraph.

## Data safety (delta vs existing provisional worksheet)

Existing worksheet: `docs/privacy-legal-audit/PLAY_DATA_SAFETY_PROVISIONAL_ANSWERS.md`
(not submitted). GRIN does not add new Play data-type **categories** beyond
files/photos already declared, but it **does** upload owner-selected PDFs and
images to Firebase Storage under the signed-in uid.

Declare (when GRIN upload is actually in the submitted binary):

| Type | Collect | Shared | Purpose |
|---|---|---|---|
| Photos | Yes, if the user attaches camera/gallery originals | Firebase/Google as infrastructure, not sold | App functionality |
| Files and docs | Yes, if the user attaches PDFs | Same | App functionality |
| User IDs | Yes (Firebase Auth uid) | Infrastructure | Account |

Do not declare financial/tax documents as a separate Play type if the form has
none; they are user files. Encrypted in transit: HTTPS. Encrypted at rest:
Google Cloud default — **[EXTERNAL VERIFICATION REQUIRED]** (same caveat as
the existing worksheet).

Account deletion: existing 15-day grace for cloud diary records. **GRIN
Storage originals are not yet in that job** (Packet D). Until Packet D option
A or B is implemented, Data safety must **not** claim GRIN files are deleted
with the account. Safer Internal text: “Goods-evidence files used in internal
testing may be retained until testers are wiped or a deletion policy ships.”

## Reviewer instructions (Play Console sign-in details)

Keep:

- Restricted: YES
- Phone: `+91 9000000000`
- Password: blank
- OTP: `654321` if the live test-phone fixture is present
- No reviewer email inbox

Add **only if** the submitted AAB shows GRIN:

> GRIN (goods receipt) may appear after onboarding. You may create a synthetic
> receipt and attach a small test image. You do not need to complete a GST
> filing. If register fails, the account may not be admitted for this test
> feature; diary Save/PDF still demonstrate core app function.

If GRIN is hidden: do not mention GRIN. Reviewers must still reach main tabs
via the existing onboarding path.

Do not put service-account keys, upload-keystores, or customer documents in
Play Console.
