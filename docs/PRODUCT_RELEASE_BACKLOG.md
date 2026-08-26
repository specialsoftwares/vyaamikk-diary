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

### [VYD-RL-002] Android R8 minification, resource shrinking, and mapping archival

**Status:** deferred  

**Target release:** after Public V1 stabilization (dedicated Internal Testing RC; do not mix into the next product-fix AAB)  

**Priority:** P2  

**Area:** Android / EAS / Play / Crash reporting  

**Decision:**

Public V1 production AABs currently ship with Expo SDK 54 default `minifyEnabled=false` and `shrinkResources=false`. R8 shrinking/obfuscation is **not** active. Google Play’s “no deobfuscation file associated with this App Bundle” warning is expected in that state and is **not** proof that the binary is obfuscated.

Do **not** enable R8 during Public V1 defect-batch builds. If later enabled, use `expo-build-properties` (`enableMinifyInReleaseBuilds`, optionally `enableShrinkResourcesInReleaseBuilds`, `extraProguardRules`) — never a committed generated `android/` tree.

**Why deferred:**

Most of the ~81 MB AAB is native `.so` (four ABIs), Hermes JS, fonts, and native debug-symbol metadata. R8 can only act on DEX/Java/Kotlin and unused resources. Phone Auth, ImagePicker Activity Result, RNFirebase, Reanimated, and Expo module discovery are reflection/JNI-sensitive. Mixing R8 with an unrelated product-fix RC would make regressions undiagnosable.

**Acceptance before implementation:**

- dedicated Internal Testing versionCode with R8 on, compared to the current unminified AAB;
- physical matrix: Phone Auth / Play Integrity / OTP, Email OTP, ImagePicker, PDF/share, records CRUD, process restart;
- archive per versionCode: AAB + source commit + `mapping.txt` (never reuse across versionCodes);
- Play mapping/native-symbol association process (EAS does not currently auto-upload mapping; `eas submit` has no Play service account);
- no blanket `-keep class com.google.firebase.** { *; }` unless a specific failure proves it.

**Notes:**

Audit completed 2026-08-26 against production AAB vc16 (`b35f9ff4-b6d4-4b9e-a3e7-a6b272371dbe`). Strategy C (enable incrementally on a dedicated RC). Related later work: Baseline/Startup Profiles, R8 Configuration Analyzer, Play deobfuscation automation.

**Added:** 2026-08-26  

**Last reviewed:** 2026-08-26  

---

# PARKED / RESEARCH

### [VYD-RL-003] Android Baseline / Startup Profiles and R8 Configuration Analyzer

**Status:** parked  

**Target release:** unassigned  

**Priority:** P3  

**Area:** Android / startup  

**Decision:**

Current AAB already embeds a small dependency-provided `baseline.prof` / `baseline.profm` via AndroidX ProfileInstaller. An **app-specific** Baseline/Startup Profile and Google’s R8 Configuration Analyzer are research items after R8 is actually enabled. Do not install experimental Android Studio/AGP tooling into the Expo project to run the analyzer.

**Why deferred:**

Requires a minified release pipeline, extra Gradle/EAS work, and physical startup measurement. Not appropriate before Public V1 and not a substitute for enabling R8.

**Added:** 2026-08-26  

**Last reviewed:** 2026-08-26_

---

# SHIPPED / ARCHIVED

_None yet. When items ship, move them here with shipped release, completion date if known, and relevant commit/tag if known. Cancelled items stay here with status = cancelled, reason, and date — do not delete._
