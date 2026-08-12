# Vyaamikk Diary — Product Release Backlog

**Internal · version-controlled · not user-facing**

This file is the **single authoritative source of truth** for product features that are intentionally scoped relative to public releases.

It is:

- internal planning only;
- version-controlled in this repository;
- **not** bundled into production UI;
- **not** rendered on the website;
- **not** exposed through in-app About / Legal;
- **not** copied into public documentation automatically.

Do **not** put API keys, secrets, passwords, service-account credentials, private tokens, OTPs, customer PII, live phone numbers, or exploit-ready vulnerability details in this file. Security notes stay high-level for planning.

---

## CURRENT-RELEASE GUARDRAIL

> **Items outside CURRENT PUBLIC RELEASE are explicitly out of scope for the release being prepared. Agents must not implement them without owner approval and release-bucket promotion.**

Release scope beats convenience. Do not pull NEXT / LATER / PARKED items forward because they are easy, nearby, or “useful.”

---

## Future agent behavior (required)

Before any significant new feature implementation:

1. Read this file (`docs/PRODUCT_RELEASE_BACKLOG.md`).
2. Determine whether the feature is:
   - current release;
   - next release;
   - later;
   - parked / research;
   - unlisted.
3. If unlisted and clearly new product scope: ask the owner / record a target release **before** implementation.
4. Never assume “mentioned in chat” means “ship now.”

**Promotion rule:** an item in NEXT PUBLIC RELEASE, LATER RELEASES, or PARKED / RESEARCH must not be implemented during current-release work unless:

1. the owner explicitly promotes it into CURRENT PUBLIC RELEASE; and
2. this backlog file is updated first.

---

## Release buckets

| Bucket | Meaning |
| --- | --- |
| **CURRENT PUBLIC RELEASE** | Approved for the release currently being prepared |
| **NEXT PUBLIC RELEASE** | Intentionally deferred until the first release after launch |
| **LATER RELEASES** | Planned but not yet assigned to a specific release |
| **PARKED / RESEARCH** | Ideas not yet approved for implementation |
| **SHIPPED / ARCHIVED** | Completed and released, or cancelled — retain history; do not delete |

Stable IDs use format `VYD-RL-NNN`. **Never renumber** existing IDs. Search for aliases / related wording before adding a duplicate.

---

# CURRENT PUBLIC RELEASE

_No deferred-feature register items here yet. Core product work for the first public launch is tracked by existing freeze / readiness docs; this section is for features that are explicitly approved into the release currently being prepared via promotion from other buckets._

---

# NEXT PUBLIC RELEASE

### [VYD-RL-001] Website Record Lookup / Cloud Records Web Retrieval

**Status:** researching  

**Target release:** Public V1.1  

**Priority:** P1  

**Area:** Website / Cloud / Security / Records  

**Decision:**

After first public launch, design and implement a read-only website feature allowing eligible cloud-backed records to be retrieved by exact public Record ID after fresh phone verification.

Current product direction:

- website remains read-only;
- record creation stays app-only;
- no general customer website account/login required;
- no public record directory;
- exact Record ID lookup only;
- record IDs server-generated, high-entropy and non-semantic;
- fresh OTP verification required;
- post-verification access must be short-lived and scoped to one record;
- list of a user’s own Record IDs requires separate fresh phone verification;
- list verification must not automatically unlock document contents;
- backend must rate-limit:
  - ID lookup attempts;
  - OTP sends per record;
  - OTP sends per phone;
  - abuse at IP/session level;
- access logs are sensitive and not publicly queryable;
- Firebase/Firestore remains the authoritative mobile record backend unless architecture is explicitly changed later;
- Lovable/Supabase must not silently become a duplicate source of record truth;
- recipient/public document verification is OUT OF V1.1 unless separately approved;
- cloud storage does NOT automatically mean web lookup permission;
- likely model:
  - Cloud-backed
  - and
  - Website Lookup Enabled
  - are separate states;
- account-level web-lookup preference + per-record override is under consideration;
- existing cloud records should not be silently enabled when the feature is turned on;
- exact pricing/paid-cloud entitlement is NOT yet final;
- SMS provider/cost architecture is NOT yet final.

**Why deferred:**

The first public release should ship the currently built core mobile product before introducing a new website access surface, SMS-cost model, entitlement model and record-scoped authorization layer.

**Dependencies:**

- Public V1 launch;
- stable cloud-record architecture;
- final paid/cloud plan model;
- SMS OTP provider decision;
- public Record ID model;
- web-access entitlement design;
- backend record-access API;
- abuse/rate-limit architecture.

**Security / privacy considerations:**

- enumeration resistance;
- SMS bombing prevention;
- no account-wide reusable verification session;
- record-scoped short-lived access grants;
- no public record indexing;
- no metadata leakage;
- safe masked-phone responses;
- timing/error-oracle audit;
- protected access analytics.

**Acceptance before implementation:**

- settle cloud-backed vs web-enabled defaults;
- settle current-phone vs record-time-phone ownership semantics;
- settle record access token TTL;
- settle “My Record IDs” list semantics;
- settle SMS provider/cost;
- prove record A verification cannot access record B;
- define account/plan entitlement;
- define migration for existing cloud records.

**Notes:**

Authoritative first deferred product surface after Public V1. Do not implement during Public V1 preparation unless owner promotes this item into CURRENT PUBLIC RELEASE and updates this file.

**Added:** 2026-08-12  

**Last reviewed:** 2026-08-12  

---

# LATER RELEASES

_None yet._

---

# PARKED / RESEARCH

_None yet._

---

# SHIPPED / ARCHIVED

_None yet. When items ship, move them here with shipped release, completion date if known, and relevant commit/tag if known. Cancelled items stay here with status = cancelled, reason, and date — do not delete._
