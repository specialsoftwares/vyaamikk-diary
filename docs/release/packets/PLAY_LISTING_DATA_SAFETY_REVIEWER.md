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
- A live 14-day Professional trial (source-only; no client grant)
- That GRIN is included in a priced SKU until Packet E real-store
  acceptance of the **already recorded** “include in existing plans” choice
  (do **not** reopen that choice here)
- Unbounded evidence storage, or advertising a GiB allowance (owner selected
  1/3/10 GiB; **do not advertise**)
- That GRIN is available on a binary where admission/Functions cannot reach it

Accurate short description addendum **if GRIN is visible and reachable on the submitted
build**:

> Goods receipts (GRIN) are an optional internal-testing workflow for recording
> goods received and attaching original PDF/image evidence. Evidence packs are
> summaries; original files stay in app storage. The app does not verify GST
> returns, e-way bills, or ITC eligibility.

If GRIN is **not** visible **or not reachable**: omit that paragraph.

## Data safety (delta vs existing provisional worksheet)

Base worksheet: `docs/privacy-legal-audit/PLAY_DATA_SAFETY_PROVISIONAL_ANSWERS.md`
(not submitted). Rebuild from actual flows:
`docs/release/proposals/team4/DATA_SAFETY_REBUILD.md`. GRIN does not add new Play data-type **categories** beyond
files/photos already declared, but it **does** upload owner-selected PDFs and
images to Firebase Storage under the signed-in uid.

Declare (when GRIN upload is actually in the submitted binary):

| Type | Collect | Shared | Purpose |
|---|---|---|---|
| Photos | Yes, if the user attaches camera/gallery originals | Firebase/Google as infrastructure, not sold | App functionality |
| Files and docs | Yes, if the user attaches PDFs | Same | App functionality |
| User IDs | Yes (Firebase Auth uid) | Infrastructure | Account |

User-entered diary amounts, credit ledgers, payment-request bank details, and
GSTIN are **financial / other financial info** even while Play IAP is off —
see DATA_SAFETY_REBUILD.md. Tax PDFs the user attaches are **files**, not a
separate Play “tax document” type. Encrypted in transit: HTTPS. Encrypted at
rest: Google Cloud default — **[EXTERNAL VERIFICATION REQUIRED]**. Do not
claim encrypted backup or an accredited audit.

Account deletion: **owner policy 45-day** cancellation window after confirmed
request (2026-10-06; supersedes 180). **Implemented still 15 days** until
Team 2. Play User Data: freeze / disable ≠ delete. Changing
`DELETION_GRACE_MS` to 45 is the pending clock, not a recoverable archive,
not GRIN purge. **Do not Save Play with 15-day copy after T2 lands. Do not
Save now.** See `DELETION_45_PLAY_DISCLOSURE.md`. **GRIN Storage originals
are not yet in that job** (P8 open). Until Packet D retention is implemented,
Data safety must **not** claim GRIN files are deleted with the account. Do
**not** flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`. Safer Internal text: “Goods-evidence
files used in internal testing may be retained until testers are wiped or a
deletion policy ships.”

Storage GiB: **1 / 3 / 10 selected. Do not advertise.**
`STORAGE_OWNER_CHOICE.md`. Do not reopen GRIN-in-existing-plans.

## Reviewer instructions (Play Console sign-in details)

Keep:

- Restricted: YES
- Phone: `+91 9000000000`
- Password: blank
- OTP: `654321` if the live test-phone fixture is present
- No reviewer email inbox

Add **only if** the submitted AAB is `internal-grin` **and** GRIN is actually
reachable for that reviewer (admission arranged; Functions present):

> GRIN (goods receipt) is enabled for this internal test account. You may create
> a synthetic receipt and attach a small test image. You do not need to complete
> a GST filing.

If GRIN is hidden **or** cannot be reached: omit that paragraph **and do not
advertise GRIN** on that AAB. Reviewers must reach You / Calendar / Settings
because the owner pre-completed email verification and profile setup — not by
finishing onboarding from a founder inbox.

Do not put service-account keys, upload-keystores, or customer documents in
Play Console.
