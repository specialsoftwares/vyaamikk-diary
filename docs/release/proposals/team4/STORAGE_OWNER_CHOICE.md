# Owner decision: GRIN retained-storage caps (ONE choice)

**This is not a recorded owner choice.** Team 4 does not pick the GiB table
for you. Counsel has not signed this. Google Play has not approved these
numbers. This sheet is **not advertising**, **not a store listing**, and
**not** a profitability guarantee.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t4-product`  
Branch: `team/grin-t4-product`  
Combined (READ-ONLY): `aea65c170adb25f09ca1045593f18847df2f3b30`  
Application SHA to describe: `520f9f98bc952fd7f30a907da9e85774629a69c0`  
Canonical CI: run `37425360211` on `0d7aa17`  
Economics SOURCE: combined
`docs/release/proposals/team2/STORAGE_ECONOMICS.md` (fetched 2026-10-06).
This product sheet does **not** replace that file.

Do **not** publish website copy, flip billing, Save a Play listing, or
advertise storage sizes from this file.

**Do not reopen** “GRIN in existing Starter / Professional / Business.” That
pricing choice is already recorded (2026-10-06). Storage cost sits on those
diary SKUs. **No separate GRIN product** is being created here.

---

## Ask (one final choice)

Write **one** of the two tables below as the public/commercial cap — or
write that you leave the table **UNRESOLVED** (code stays at the wired
proposal; advertising stays blocked).

Do **not** silently replace **1 / 5 / 20 GiB**.  
Do **not** treat the smaller table as already selected.  
Do **not** call the smaller table **guaranteed profitable**.

| # | Option | Starter | Professional | Business | Status in source |
|---|---|---|---|---|---|
| **1** | Original proposal | **1 GiB** | **5 GiB** | **20 GiB** | Wired as `PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES`. **Not confirmed. Must not be advertised.** |
| **2** | Smaller alternative | **256 MiB** | **1 GiB** | **5 GiB** | Named `OWNER_ALTERNATIVE_STORAGE_CAPS_BYTES` on combined application `520f9f9`. **Not wired as the live cap.** |

Free / unentitled: **0** cloud GRIN bytes in both tables (SOURCE).

**Owner choice (1 / 2 / UNRESOLVED):** _________________ **Date:** ________  
**Counsel (if any):** _________________

Until that row is filled by you, Team 4 will keep **both** tables in
handoff and listing worksheets. Public copy of either size is **HOLD**.

---

## Already decided (do not reopen)

Per-owner **retained** cloud storage (not per device, not a monthly reset).
Originals **and** retained derivatives both count. Technical ceilings stay:
15 MiB PDF / 10 MiB image; two concurrent uploads; up to eight 2 MiB
derivatives per original.

At the cap (SOURCE behaviour, not a live deploy from this file):

- Warn at 80% and 95% (do not fail the warn).
- Refuse additional **cloud uploads**; keep view / download / export.
- Never claim an upload succeeded when it did not.
- Never silently delete old evidence. No overage fee.
- No undisclosed download quota, rate limit, or “make the numbers work”
  throttle. Refuse-at-byte-cap is the only write-path stop.

This sheet only asks which **byte table** to confirm.

---

## User trade-offs (plain language)

Approximate **15 MiB PDF** originals if the cap were filled with that size
only (derivatives would use part of the same cap):

| Cap | ≈ originals at 15 MiB each |
|---|---|
| 256 MiB | ~17 |
| 1 GiB | ~68 |
| 5 GiB | ~341 |
| 20 GiB | ~1,365 |

**If you confirm option 1 (1 / 5 / 20 GiB):**

- Starter / Professional / Business users can keep a large evidence library
  in the cloud (hundreds to more than a thousand 15 MiB PDFs on Business).
- Project **egress** on a full Business library is the expensive line, not
  storage-at-rest. A user who downloads the whole 20 GiB library four times
  in a month can cost more than that month’s **assumed** Business net (see
  economics below). Special Softwares pays GCP; the user is not billed
  overage (refuse at cap).
- Marketing 1 / 5 / 20 GiB on Play or the website is still **forbidden**
  until you confirm **and** listing copy is accurate.

**If you confirm option 2 (256 MiB / 1 GiB / 5 GiB):**

- Users hit refuse-at-cap sooner. A Starter library of ~17 full PDFs is a
  different product than ~68.
- Project exposure to repeated full-library downloads is smaller. That is a
  **cost-sensitivity**, **not** a promise the SKU is profitable.
- Combined source still has **1 / 5 / 20 wired**. Confirming option 2
  requires a later authorized constant change. This file does **not** make
  that change.

**If you leave UNRESOLVED:** code may keep the wired 1 / 5 / 20 constants
labelled pending confirmation. **Do not advertise either table.** Public
GRIN storage marketing stays blocked.

---

## Cost assumptions (Team 2 economics — labelled, not a bill)

Copied for this owner ask from combined `STORAGE_ECONOMICS.md` at
`aea65c1`. Re-read that file before treating these as current. **Not** live
Play prices. **Not** this project’s invoice.

### Catalog (SOURCE expected paise — catalog on Play is **NOT RUN**)

GRIN is included in existing plans. Entitlement does **not** depend on
these numbers.

| Plan | Monthly list | Monthly net after **assumed 15%** store cut |
|---|---|---|
| starter | ₹99 | **₹84.15** ≈ **$1.00** |
| professional | ₹249 | **₹211.65** ≈ **$2.52** |
| business | ₹499 | **₹424.15** ≈ **$5.05** |

Yearly-effective monthly net (list÷12, then 15%): starter ≈ **$0.67**;
professional ≈ **$1.69**; business ≈ **$3.37**. Quarterly/yearly **reduce**
effective monthly net versus monthly SKUs.

| Assumption | Value | Label |
|---|---|---|
| Play / store cut | **15%** of catalog list | **ASSUMPTION** — not Google’s reported fee for this account |
| India GST / other tax | **not deducted** | **ASSUMPTION** — unknown whether catalog paise are GST-inclusive |
| FX | **₹84.00 / USD** (2026-10-06) | **ASSUMPTION** — not a live FX feed |
| GiB | 2³⁰ bytes | GCP list pages use gibibytes |
| Downloads | **unrestricted** in this product | no download cap is specified |

### Bucket location — still UNKNOWN

| Item | Value |
|---|---|
| Bucket name | `vyaamikk-diary.firebasestorage.app` (SOURCE) |
| Bucket location | **UNKNOWN** |
| Functions region | `asia-south1` — **do not treat as the bucket location** |
| This session | `gcloud` / `gsutil` **absent**; no ADC; **not** a verified GCS `storage.buckets.get` |

**Do not invent** `asia-south1` (or any other region) as a verified bucket
location. If the bucket is not in that region, stored-byte and egress SKUs
differ.

Models use public Cloud Storage **list** Standard single-region rates as a
**floor**, plus a labelled regional bound — **not** a bill for this
project:

- Stored bytes: **$0.020–$0.026 / GiB-month** (upper = +30% ESTIMATE)
- Internet egress: **$0.12 / GiB** first-band worldwide / Asia excl. China
  (out-of-band China **$0.23**, Australia **$0.19**)
- Do **not** apply Firestore’s network free allowances to Cloud Storage
- Cloud Storage Always Free is US-region / per-project and is **not**
  allocated per customer while location is UNKNOWN

### Worked Team 2 examples (not guarantees)

**Normal** (few receipts, small JPEGs): GCP variable cost on the order of
**cents / account / month**, under starter monthly net ~$1.00 **in that
example**. Not a guarantee for every account or SKU.

**Heavy, option 1 caps** (15 MiB PDFs, high stored-byte bound $0.026,
egress $0.12, no GCS free tranche):

| Meter | Starter 1 GiB, 1× download | Business 20 GiB, 1× | Business 20 GiB, 4× |
|---|---|---|---|
| High-bound GCP | **~$0.17–$0.22** | **~$3.0–$3.1** | **~$10.2–$10.3** |
| Monthly SKU net (15%, no tax) | ~$1.00 | ~$5.05 | ~$5.05 |
| Yearly-effective monthly net | ~$0.67 | ~$3.37 | ~$3.37 |

Repeated full-library download on **20 GiB** can exceed **monthly** net
and exceeds **yearly-effective** net even sooner. Storage-at-rest alone
does not; **egress does**.

**Sensitivity, option 2 (not a profitability claim):**

- Business 5 GiB × 4 downloads × $0.12 ≈ **$2.40** plus ~$0.13 storage is
  **under** business **monthly** net ~$5.05 **with the listed
  assumptions**, and **near / above** business **yearly-effective** net
  ~$3.37 if downloads are repeated.
- Starter 256 MiB × 4 downloads × $0.12 ≈ **$0.12** is under starter
  monthly net **in that same sensitivity**, not as a promise.

---

## What Team 4 will not do from this file

- Will **not** change wired 1 / 5 / 20 constants to 256 MiB / 1 / 5.
- Will **not** advertise either table.
- Will **not** add a hidden download restriction.
- Will **not** activate billing, create Play products, or Save listing copy
  that names a GiB allowance.

---

## Pointers

- Economics (authoritative numbers): combined
  `docs/release/proposals/team2/STORAGE_ECONOMICS.md`
- Recorded GRIN-in-existing-plans (do not reopen):
  `docs/release/packets/OWNER_POLICY_DECISION_SHEET.md`
- The other remaining owner write (deletion clocks):
  `docs/release/proposals/team4/DELETION_15_VS_180_OWNER_SHEET.md`
- Handoff: `BILLING_PLAY_HANDOFF.md`
