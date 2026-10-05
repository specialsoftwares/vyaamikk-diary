# Team 2 — GRIN storage economics (SOURCE, not advertising)

Fetched **2026-10-06**. Not live Play prices. Not a store listing. Not owner advertising copy.

GRIN is included in existing Starter / Professional / Business. **No separate GRIN SKU.** Catalog paise below are **SOURCE expected** commercial config in `functions/src/billing/products.ts`. The catalog is **not run on Play**. Entitlement never depends on these numbers.

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

## Assumptions (labelled, not store authority)

| Item | Value | Label |
|---|---|---|
| Play / store cut | **15%** of list | ASSUMPTION — not Google’s reported fee for this account |
| FX | **₹84.00 / USD** | ASSUMPTION 2026-10-06; not a live FX feed |
| Starter monthly net after cut | ₹99 × 0.85 = **₹84.15** ≈ **$1.00** | derived |
| Business monthly net after cut | ₹499 × 0.85 = **₹424.15** ≈ **$5.05** | derived |
| Region | `asia-south1` (Mumbai) | project Functions region |
| Storage class | Cloud Storage **Standard** | retained originals + derivatives |
| GiB | 2³⁰ bytes | GCP list pages use gibibytes |

## Public GCP list prices (asia-south1) — 2026-10-06

URLs fetched/cited:

- Cloud Storage: https://cloud.google.com/storage/pricing
- Firestore Standard edition: https://cloud.google.com/firestore/pricing
- Cloud Run (Functions v2): https://cloud.google.com/run/pricing
- Cloud Run functions 1st gen (bound only): https://cloud.google.com/functions/pricing-1stgen
- Functions overview (points at Cloud Run vs 1st gen): https://cloud.google.com/functions/pricing
- India SKU group (SKU ids, not unit prices): https://cloud.google.com/skus/sku-groups/india-region-data-centers

This repo’s GRIN callables are `firebase-functions` **v2** (`onCall` region `asia-south1`) → **Cloud Run** pricing, not 1st-gen GB-second as the sole meter.

### Cloud Storage Standard, stored bytes

The 2026-10-06 public Storage page presents a **region-collapsed hourly** Standard rate:

- **$0.000027397 per GiB-hour** (page table “Region / Standard storage”).
- Monthly equivalent: 0.000027397 × 730 ≈ **$0.0200 / GiB-month**.

asia-south1 has a named SKU “Standard Storage Mumbai” (`2717-BEFE-3773`) on the India SKU-group page, but **that page does not publish a unit price**. Treat the collapsed hourly rate as the **floor**. Bound Mumbai stored bytes at **$0.020–$0.026 / GiB-month** (upper = +30% if a regional premium is not isolated).

**asia-south1-specific stored-byte unit price: UNKNOWN (bounded).**

### Cloud Storage Class A / Class B operations

Single-region Standard, flat namespace (https://cloud.google.com/storage/pricing):

- Class A: **$0.005 / 1,000 operations**
- Class B: **$0.0004 / 1,000 operations**

Mumbai Class A/B SKUs exist (`1A95-CC20-AA93`, `B745-8503-AFD0`) without a distinct unit price on the SKU-group HTML. Use the single-region table. Dual-region A is $0.01/1k — **not** this model (single-region bucket assumed).

### Egress (internet)

The Storage pricing HTML did not isolate an asia-south1-only egress SKU. GCP general internet outbound (worldwide dest. excl. China & Australia; includes Hong Kong) on the Firestore/network tables:

- First 10 GiB/month: **$0.00** (free tranche; whether GCS GRIN downloads always consume this tranche is **UNKNOWN**)
- Next: **$0.12 / GiB** (10 GiB–1 TiB APAC/Europe/Americas band)

Bound egress at **$0.00–$0.12 / GiB** for the first 10 GiB (if the free tranche applies vs not) and **$0.12 / GiB** thereafter. China/Australia bands ($0.19–$0.23) are out of the India-typical model.

**asia-south1-specific egress SKU: UNKNOWN (bounded $0.08–$0.23 / GiB).**

### Firestore Standard edition (reads / writes / stored data)

The 2026-10-06 Firestore pricing page lists Mumbai (`asia-south1`) in the location index but the extracted default table is **not region-split** in the HTML. Default (Iowa-shaped) list:

| Meter | List | Unit |
|---|---|---|
| Document reads | **$0.03** | per 100,000 |
| Document writes | **$0.09** | per 100,000 |
| Document deletes | **$0.01** | per 100,000 |
| Stored data | **$0.000205479** per GiB (page unit) | treat as **~$0.15 / GiB-month** if interpreted as GiB-hour × 730; classic $0.18/GiB-month is the **upper bound** |

Daily free quota (project default DB): 50k reads, 20k writes, 20k deletes, 1 GiB stored. Named extra DBs: no free quota.

**asia-south1-specific Firestore unit prices: UNKNOWN (use default table as floor; +30% bound).**

### Cloud Run / Functions GB-second and invocations

asia-south1 is listed under Cloud Run **request-based** regions (https://cloud.google.com/run/pricing, 2026-10-06):

| Meter | List (request-based, active) |
|---|---|
| Memory | **$0.0000025 / GiB-second** |
| CPU | **$0.000024 / vCPU-second** |

Free tier (request-based table): 180,000 vCPU-seconds and 360,000 GiB-seconds / month (page; confirm in billing). Per-request fee after free requests is commonly **$0.40 / million** (Functions 1st-gen invocation table; Cloud Run request fee: **UNKNOWN if identical** — bound $0.00–$0.40 / million).

1st-gen Functions **Tier 2** includes `asia-south1`: **$0.0000035 / GB-second** + **$0.40 / million** after 2 million free. Use as an **upper compute bound** if a callable is still 1st-gen.

## Worked models (originals + retained derivatives)

Technical ceilings already in source (unchanged): 15 MiB PDF / 10 MiB image; 2 concurrent uploads.

### Typical — few receipts, small images

Assumptions: 20 retained originals, 400 KiB JPEG each, 20 thumbnails 80 KiB, 40 downloads/month, 80 register/reserve/verify writes.

| Cost | Typical |
|---|---|
| Stored bytes | 20×400 KiB + 20×80 KiB ≈ **9.4 MiB** ≈ 0.009 GiB × $0.026 ≈ **<$0.001** |
| Class A (uploads) | ~80 × $0.005/1k ≈ **<$0.001** |
| Class B (downloads) | ~40 × $0.0004/1k ≈ **<$0.001** |
| Egress | 40×400 KiB ≈ 16 MiB; inside/near free tranche ≈ **$0–$0.002** |
| Firestore | tens of writes/reads; inside daily free quota on the default DB |
| Functions | hashing 400 KiB at 256 MiB RAM × 1 s × 20 ≈ 5 GiB-s ≪ free tier |

**Typical GCP variable cost ≪ $0.05 / account / month** even at the high bound. Starter net ~$1.00 and business net ~$5.05 both clear this by a wide margin.

### Heavy — near proposed cap, 15 MiB PDFs + downloads

Proposed caps (not advertised): Starter **1 GiB**, Professional **5 GiB**, Business **20 GiB**. Total retained per account (not per device, not monthly reset).

Starter at 1 GiB of 15 MiB PDFs ≈ 68 originals. One full download of the library = 1 GiB egress.

| Meter | Starter 1 GiB, 1× download | Business 20 GiB, 1× download | Business 20 GiB, 4× download |
|---|---|---|---|
| Stored bytes (high $0.026) | $0.026 | $0.52 | $0.52 |
| Egress (no free tranche, $0.12) | $0.12 | $2.40 | $9.60 |
| Class B gets | negligible | negligible | ~$0.01 |
| Functions hash (256 MiB × 5 s × N) | ~$0.001 | ~$0.02 | ~$0.02 |
| Firestore metadata | ≪ $0.05 unless far over free quota | same | same |
| **High-bound total** | **~$0.20** | **~$3.00** | **~$10.2** |
| Plan net (15% cut) | **~$1.00** | **~$5.05** | **~$5.05** |
| Margin | positive | positive (1×) | **negative** |

Repeated full-library download on a **20 GiB** business account can exceed monthly net after Play’s assumed cut. Storage-at-rest alone does not; **egress does**.

No overage fees are charged to the user in source (refuse at cap). Project cost still lands on Special Softwares.

## Verdict

**Do not advertise** Starter 1 GiB / Professional 5 GiB / Business 20 GiB until the owner accepts residual egress cost (or a download-rate limit, which is not in this slice).

Typical usage **does** support the proposal. The **heavy + repeated download** bound **does not** support **20 GiB** against business monthly ₹499 after a 15% cut.

Per owner instruction: **do not silently change the proposed GiB constants in code.** Machinery uses those constants labelled `PROPOSED_PENDING_OWNER_CONFIRMATION`.

### Single alternative for owner approval

**256 MiB (starter) / 1 GiB (professional) / 5 GiB (business).**

Rationale: 5 GiB × 4 full downloads × $0.12 ≈ $2.40, plus $0.13 storage, stays under ~$5.05 business net even with no egress free tranche. Starter 256 MiB × 4 downloads × $0.12 ≈ $0.12, under ~$1.00. Free-tier cloud storage remains **0 bytes when quota enforcement is on** (fail closed; local pending stays unsynced).

HOLD: public copy, Play listing, in-app storage marketing.

## Behaviour implemented in source (not live deploy)

- Warn at 80% and 95% (structured fields; do not fail).
- At cap: refuse additional cloud uploads; keep view / download / export; never claim success; never silent-delete; no overage fee.
- Keep 15 MiB PDF / 10 MiB image and two concurrent uploads.
- Concurrent reservations, retry, abandoned holds, accounting repair, downgrade-over-limit **without deleting** evidence.
- Derivatives distinguishable from originals; both count toward the retained total.
