# Team 2 — GRIN storage economics (SOURCE, not advertising)

Fetched **2026-10-06**. Not live Play prices. Not a store listing. Not owner advertising copy.

GRIN is included in existing Starter / Professional / Business. **No separate GRIN SKU.** Catalog paise below are **SOURCE expected** commercial config in `functions/src/billing/products.ts`. The catalog is **not run on Play**. Entitlement never depends on these numbers.

Wired cap constants remain **1 / 5 / 20 GiB** labelled `PROPOSED_PENDING_OWNER_CONFIRMATION`. They are **not confirmed** and **must not be advertised**. **256 MiB / 1 GiB / 5 GiB** is an owner-approval **alternative**, not a selected replacement, and is **not** wired.

This note does **not** impose a download cap, rate limit, or other undisclosed restriction. Refuse-at-byte-cap is the only write-path stop in source. Download / view / export remain available within existing auth.

## SOURCE expected catalog (integer paise)

| Canonical SKU | Plan | Period | Expected paise | INR (label only) |
|---|---|---|---|---|
| `vyd_starter_monthly` | starter | monthly | 9_900 | ₹99 |
| `vyd_starter_quarterly` | starter | quarterly | 24_900 | ₹249 |
| `vyd_starter_yearly` | starter | yearly | 79_900 | ₹799 |
| `vyd_professional_monthly` | professional | monthly | 24_900 | ₹249 |
| `vyd_professional_quarterly` | professional | quarterly | 64_900 | ₹649 |
| `vyd_professional_yearly` | professional | yearly | 199_900 | ₹1,999 |
| `vyd_business_monthly` | business | monthly | 49_900 | ₹499 |
| `vyd_business_quarterly` | business | quarterly | 129_900 | ₹1,299 |
| `vyd_business_yearly` | business | yearly | 399_900 | ₹3,999 |

## Bucket vs Functions region (do not substitute)

| Item | Value | How known |
|---|---|---|
| Bucket name | `vyaamikk-diary.firebasestorage.app` | SOURCE (`productionAdminConfig` / live pin) |
| Bucket location | **UNKNOWN** | Anonymous GCS `storage.buckets.get` HTTP **401**. Firebase CLI is logged in but no Application Default Credentials / `gcloud` were used (would be extra OAuth, still a mutate risk to request). **Do not treat Functions region as the bucket location.** |
| Functions callable region | `asia-south1` (Mumbai) | SOURCE for Cloud Run/Functions metering only |
| Storage class assumed for models | Standard, single-region, flat namespace | ASSUMPTION until bucket location/class is read |

If the bucket is not in `asia-south1`, stored-byte and egress SKUs differ. Models below use **public list** Standard single-region rates as a **floor**, plus a labelled regional bound — they are **not** a bill for this project.

## Assumptions (labelled, not store or tax authority)

| Item | Value | Label |
|---|---|---|
| Play / store cut | **15%** of catalog list | ASSUMPTION — not Google’s reported fee for this account; not measured |
| India GST / other tax | **not deducted** in the net figures below | ASSUMPTION — unknown whether catalog paise are GST-inclusive; **not** applied |
| FX | **₹84.00 / USD** | ASSUMPTION 2026-10-06; not a live FX feed |
| GiB | 2³⁰ bytes | GCP list pages use gibibytes |
| Downloads | **unrestricted** in this slice | no product download quota is specified or implied |

### Effective monthly catalog revenue (before FX; after assumed 15% store cut only)

Quarterly ÷ 3 and yearly ÷ 12. These are **accounting identities on the catalog**, not Play proceeds.

| Plan | Monthly list | Monthly net (15%) | Quarterly list → /3 | Quarterly net /3 | Yearly list → /12 | Yearly net /12 |
|---|---|---|---|---|---|---|
| starter | ₹99 | **₹84.15** ≈ $1.00 | ₹83.00 | **₹70.55** ≈ $0.84 | ₹66.58 | **₹56.60** ≈ $0.67 |
| professional | ₹249 | **₹211.65** ≈ $2.52 | ₹216.33 | **₹183.88** ≈ $2.19 | ₹166.58 | **₹141.60** ≈ $1.69 |
| business | ₹499 | **₹424.15** ≈ $5.05 | ₹433.00 | **₹368.05** ≈ $4.38 | ₹333.25 | **₹283.26** ≈ $3.37 |

Yearly/quarterly **reduce** effective monthly net versus monthly SKUs. A heavy-usage month that fits monthly business net can miss yearly-effective net.

## Public GCP list prices vs estimates

URLs fetched 2026-10-06:

- Cloud Storage: https://cloud.google.com/storage/pricing
- Firestore Standard edition: https://cloud.google.com/firestore/pricing
- Cloud Run: https://cloud.google.com/run/pricing

**Verified list (page tables, not a project invoice):**

### Cloud Storage Standard — stored bytes (list)

Region-collapsed hourly Standard: **$0.000027397 / GiB-hour**. Monthly equivalent at 730 h: ≈ **$0.0200 / GiB-month**.

asia-south1-specific stored-byte unit price: **UNKNOWN**. Bound used in models: **$0.020–$0.026 / GiB-month** (upper = +30% ESTIMATE if a regional premium is not isolated).

### Cloud Storage operations (list — single-region Standard, flat namespace)

- Class A: **$0.005 / 1,000 operations**
- Class B: **$0.0004 / 1,000 operations**

### Cloud Storage internet egress (list — general network usage)

The Storage pricing table bills general internet outbound **per GiB from the first GiB**. First-band worldwide and Asia (excl. China, incl. Hong Kong): **$0.12 / GiB** (0–10 **TiB**). China **$0.23 / GiB**; Australia **$0.19 / GiB**.

**Do not apply Firestore’s or other products’ network free allowances to Cloud Storage.** The previous “first 10 GiB/month free” tranche cited from Firestore/network tables is **not** a verified GCS internet-egress free quantity.

Cloud Storage Always Free (5 GB-month Standard, 100 GB North America data transfer, 5k Class A / 50k Class B) applies only to **US-WEST1 / US-CENTRAL1 / US-EAST1**, aggregated **per Google Cloud project**, and **must not** be allocated independently to every customer. Bucket location is UNKNOWN, so Always Free is **not** included in per-account models.

Egress used in models: **$0.12 / GiB** (India-typical / worldwide-excl-China-Australia list). Out-of-band **$0.19–$0.23 / GiB**.

### Firestore Standard edition (list)

Default (not asia-south1-split in the extracted HTML): reads **$0.03 / 100k**, writes **$0.09 / 100k**, deletes **$0.01 / 100k**. Stored data classic band ~**$0.15–$0.18 / GiB-month** (ESTIMATE from page units). Daily free quota (50k reads / 20k writes / 20k deletes / 1 GiB) is **project-default-DB**, **shared**, and **must not** be treated as a per-customer allowance.

asia-south1-specific Firestore unit prices: **UNKNOWN**.

### Cloud Run / Functions (list)

asia-south1 is a Cloud Run request-based region: memory **$0.0000025 / GiB-second**, CPU **$0.000024 / vCPU-second**. Free-tier vCPU/GiB-seconds on the Cloud Run table are **project-level**, not per customer.

## Cost lines this model must include

| Line | When it happens | Meter |
|---|---|---|
| Stored originals | reserved → retained until explicit purge | GCS stored bytes |
| Stored derivatives | up to 8 × 2 MiB per original, both count toward the cap | GCS stored bytes |
| Uploads / retries | Class A insert; abandoned reservation still occupies bytes until release | GCS Class A + reserved bytes |
| Verification reads | stream stored bytes to hash (Class B get + Functions CPU/RAM) | GCS Class B + Cloud Run |
| Downloads | owner retrieve/export; **no product download cap** | GCS Class B + **egress $0.12/GiB** |
| Firestore metadata | reserve/verify/link/accounting/status | Firestore R/W (project free tier not assigned per customer) |
| Post-expiry retained storage | entitled/free: no age purge. After genuine expiry: 90-day read then SOURCE `expired_purge_eligible` only. **No scheduler is wired.** Bytes remain billable until an authorized purge. | GCS stored bytes continue |
| Account-deletion GRIN trees | listed behind `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false` | not purged today |

## Worked models (originals + retained derivatives)

Technical ceilings in source (unchanged): 15 MiB PDF / 10 MiB image; 2 concurrent uploads; derivatives 2 MiB × 8.

Caps used below are the **proposed** 1 / 5 / 20 GiB (not advertised). Alternative 256 MiB / 1 GiB / 5 GiB is shown only as a sensitivity, not as a profitability guarantee.

### Normal — few receipts, small images

Assumptions: 20 retained originals, 400 KiB JPEG each, 20 thumbnails 80 KiB, 40 downloads/month, some retries (≈10 extra Class A), verification reads ≈20, Firestore tens of R/W. **Do not** subtract project free tiers from this account.

| Cost | Normal (high bound) |
|---|---|
| Stored bytes | ~9.4 MiB × $0.026 ≈ **<$0.001** |
| Class A (uploads + retries) | ~90 × $0.005/1k ≈ **<$0.001** |
| Class B (verify + download) | ~60 × $0.0004/1k ≈ **<$0.001** |
| Egress | 40×400 KiB ≈ 16 MiB × $0.12 ≈ **$0.002** |
| Firestore + Functions | small; bill as project remainder, not $0 because “free quota” |

**Normal GCP variable cost is on the order of cents per account / month**, well under starter monthly net ~$1.00 **in this example**. That is not a guarantee for every account, period, or SKU.

### Heavy — near proposed cap, 15 MiB PDFs, downloads, derivatives, retries, post-expiry

Starter 1 GiB of 15 MiB PDFs ≈ 68 originals. Business 20 GiB ≈ 1,365 originals. One full-library download = cap-sized egress. Four full downloads = 4×. Derivatives: if each original keeps one 2 MiB thumbnail, add ~12% bytes (still inside cap because derivatives count). Retries: extra Class A, reserved bytes until release. Post-expiry: same stored-byte line continues until purge (not wired).

| Meter | Starter 1 GiB, 1× DL | Business 20 GiB, 1× DL | Business 20 GiB, 4× DL |
|---|---|---|---|
| Stored bytes (high $0.026) | $0.026 | $0.52 | $0.52 |
| Egress ($0.12, no GCS free tranche applied) | $0.12 | $2.40 | $9.60 |
| Class A/B + verify hash + retries | ~$0.01 | ~$0.05 | ~$0.05 |
| Firestore metadata (no per-customer free) | ~$0.01–$0.05 | ~$0.05 | ~$0.05 |
| **High-bound total** | **~$0.17–$0.22** | **~$3.0–$3.1** | **~$10.2–$10.3** |
| Monthly SKU net (15% cut, no tax) | ~$1.00 | ~$5.05 | ~$5.05 |
| Yearly-effective monthly net | ~$0.67 | ~$3.37 | ~$3.37 |

Repeated full-library download on a **20 GiB** business account can exceed **monthly** net after the assumed store cut, and exceeds **yearly-effective** net even sooner. Storage-at-rest alone does not; **egress does**. Project cost lands on Special Softwares. No overage fee is charged to the user (refuse at cap).

## Verdict

**Do not advertise** Starter 1 GiB / Professional 5 GiB / Business 20 GiB.

- Normal usage **can** sit under starter monthly net in the example above.
- Heavy 20 GiB + repeated downloads **need not** sit under business monthly or yearly-effective net.
- **Do not** describe **256 MiB / 1 GiB / 5 GiB** as guaranteed profitable. As a **sensitivity**, 5 GiB × 4 downloads × $0.12 ≈ $2.40 plus ~$0.13 storage is **under** business **monthly** net ~$5.05 with the listed assumptions, and **near / above** business **yearly-effective** net ~$3.37 if downloads are repeated. Starter 256 MiB × 4 downloads × $0.12 ≈ $0.12 is under starter monthly net **in that same sensitivity**, not as a promise.

**Owner must still choose.** This note does not pick a cap.

| Option | Meaning | This slice |
|---|---|---|
| **A — 1 / 5 / 20 GiB** | Currently wired, labelled `PROPOSED_PENDING_OWNER_CONFIRMATION` | **Not confirmed. Do not advertise.** |
| **B — 256 MiB / 1 GiB / 5 GiB** | Sensitivity only | **Alternative, not a selected replacement, not wired, not guaranteed profitable.** |
| **C — other** | Owner names different ceilings | Not implemented here |

Do not silently replace A with B. Do not add an undisclosed download restriction to “make the numbers work.”

HOLD: public copy, Play listing, in-app storage marketing. Owner decision required.

## Behaviour implemented in source (not live deploy)

- Warn at 80% and 95% (structured fields; do not fail).
- At cap: refuse additional cloud uploads; keep view / download / export; never claim success; never silent-delete; no overage fee.
- Keep 15 MiB PDF / 10 MiB image and two concurrent uploads.
- Concurrent reservations, retry, abandoned holds, explicit authorized `repairAccounting`, downgrade-over-limit **without deleting** evidence.
- Derivatives distinguishable from originals; both count toward the retained total.
- Malformed/inconsistent accounting and colliding hold identity fail closed (S1/S2). Holds map has a **technical** entry limit (`MAX_STORAGE_HOLDS = 2500`); not a customer entitlement; not indefinite scale. See `HOLDS_MAP_BOUND.md`.
