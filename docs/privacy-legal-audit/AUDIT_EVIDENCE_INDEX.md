# AUDIT EVIDENCE INDEX

> **23 October 2026 correction: HOLD.** See [current acceptance report](SEVEN_STAGE_ACCEPTANCE_2026-10-23.md). The inventory and checkpoints below are historical; earlier CI does not certify the new candidate.

## 22 October 2026 first-run checkpoint

| Item | Evidence |
|---|---|
| Candidate | `security/firebase-session-hardening` at `06d3fcd42b2eaae1c057e1bf7461a088e208bfff`, worktree clean. Reactivation commit is the HEAD. Parent session commit `03b974d` is contained. |
| Isolated other checkout | `/Users/shivamsaurav/Vyaamikk Diary` is `draft/goods-evidence-domain-contract` at `55f2df1` with unrelated dirty files. Not edited. |
| Live project | Intended project id `vyaamikk-diary`. At 2026-10-22T12:00:01Z, `gcloud` showed an active account marker but Firestore, Storage, and Functions list calls asked for an account selection. `firebase projects:list` returned expired credentials. No interactive login was started. All deployed identities are `LIVE_PENDING`. |
| Parallel agents | Explore agents did not return findings. This checkpoint is from direct reads of `06d3fcd`. |
| Product changes | None. No encryption, grace edit, migration, purge enablement, deploy, or build. |

The July index below remains historical (`f1019b6`).

# AUDIT EVIDENCE INDEX (July historical)

**Repository tip audited:** `f1019b6`  
**Protected runtime/website commits accounted for:** `900c46e`, `0b12fb4`, `bfc2968`, `4a1a529`, `4d04786`, `c54c8c9`, `a9e0e23`, `f1019b6`  
**Unstaged left untouched:** `src/i18n/i18n.ts`, `src/i18n/validateLocales.ts`, `.expo-export-audit/`, local `.env`

---

## Phase A documents

| File | Contents |
|------|----------|
| `TECHNICAL_DATA_INVENTORY.md` | Categories, confidence |
| `DATA_FLOW_AND_STORAGE_REGISTER.md` | Flows, stores |
| `SDK_AND_PROCESSOR_REGISTER.md` | Processors |
| `PERMISSIONS_AND_DISCLOSURES_MATRIX.md` | Permissions |
| `RETENTION_AND_DELETION_MATRIX.md` | Retention |
| `ACCOUNT_DELETION_TECHNICAL_AUDIT.md` | Deletion E2E |
| `WEBSITE_TRACKING_AUDIT_GAPS.md` | Lovable questionnaire |
| `PLAY_DATA_SAFETY_MAPPING.md` | Play mapping |
| `POLICY_CONTRADICTION_REGISTER.md` | Contradictions |
| `OWNER_AND_COUNSEL_FACT_QUESTIONNAIRE.md` | Open facts |
| `LEGAL_SOURCE_AND_COMMENCEMENT_MATRIX.md` | DPDP/Play sources |
| `AUDIT_EVIDENCE_INDEX.md` | This file |

## Phase B documents

| File | Contents |
|------|----------|
| `DRAFT_PRIVACY_POLICY_FOR_REVIEW.md` | Provisional PP |
| `DRAFT_TERMS_OF_USE_FOR_REVIEW.md` | Provisional Terms |
| `DRAFT_COOKIE_POLICY_FOR_REVIEW.md` | Provisional cookies |
| `DRAFT_ACCOUNT_DELETION_DISCLOSURE.md` | Deletion disclosure |
| `DRAFT_IN_APP_PERMISSION_DISCLOSURES.md` | Permission copy |
| `PLAY_DATA_SAFETY_PROVISIONAL_ANSWERS.md` | Form answers |
| `WEBSITE_LEGAL_IMPLEMENTATION_BRIEF_FOR_LOVABLE.md` | Site brief |

---

## Key code / config citations

| Area | Paths |
|------|-------|
| Brand / operator | `src/config/brand.ts`, `src/config/legal.ts` |
| Env / public URLs | `src/config/env.ts`, `src/config/publicLinks.ts` |
| App ID / permissions | `app.json` |
| Profile model | `src/domain/types.ts` |
| Entry types | `src/domain/businessEntry.ts` |
| Grace period | `src/domain/identityLifecycle.ts` |
| Session | `src/services/session.ts` |
| Local DB | `src/localDb/schema.ts`, `init.ts` |
| Notifications | `src/services/notifications.ts` |
| Location | `src/services/location.ts`, `app.json` plugins |
| Storage | `src/services/storage/userStorage.ts`, `storage.rules` |
| Deletion client | `src/services/accountDeletion/*`, `app/(app)/settings/delete.tsx` |
| Deletion server | `functions/src/deletion/*` (`finalPurge`, `storagePurge`, `authDelete`, `deletionJob`, `lifecycle`) |
| Storage path inventory | `src/services/storage/userOwnedStoragePaths.ts` (+ functions mirror) |
| Local device policy | `localDevicePolicy*.ts`, `LOCAL_DEVICE_DELETION_DECISION.md` |
| Closure report | `DELETION_ENGINEERING_CLOSURE_REPORT.md` |
| In-app legal text | `src/content/legal/documents.ts` |
| Legacy web | `public-site/*.html` |
| Docs legal stubs | `docs/legal/*` |

---

## Checks run during this privacy audit

| Check | Result |
|-------|--------|
| Application behaviour / schemas / rules / packages changed? | **No** |
| Git commit / push? | **No** (per owner instruction) |
| `typecheck` / app tests? | **Not required** for docs-only; not run as a gate |
| Secrets printed? | **No** |

---

## Confidence reminder

Statements marked `EXTERNAL VERIFICATION REQUIRED` or `OWNER CONFIRMATION REQUIRED` must not be published as settled facts.
