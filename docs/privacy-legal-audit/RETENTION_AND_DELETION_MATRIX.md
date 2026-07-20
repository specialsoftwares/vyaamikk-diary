# RETENTION AND DELETION MATRIX

**Tip:** `f1019b6` · Distinguishes **implemented behaviour** from **proposed business decisions**.

---

## 1. Implemented retention / cleanup (CODE VERIFIED)

| Data class | Implemented retention | Trigger | Notes |
|------------|----------------------|---------|-------|
| Active account cloud data | While account `active` | Ongoing use | No global TTL found on business records |
| Deletion grace | **15 days** (`DELETION_GRACE_DAYS` / `DELETION_GRACE_MS`) | `markAccountPendingDeletion` → `deletionScheduledFor` + `deletionJobs` | Unchanged product decision |
| Pending → final | After `graceExpiresAt` | `runFinalAccountPurge`: Storage → Firestore → indexes → Auth | `functions/src/deletion/finalPurge.ts` |
| Firestore subcollections | Deleted until empty (400/batch loops) | Final deletion | Mitigated prior single-pass limit |
| Firebase Storage user prefixes | Deleted + verified empty | Final deletion | Active objects only; soft-delete **EXTERNAL** |
| Firebase Auth user | Deleted (idempotent if absent) | After data phases | Retry via ledger if fails |
| `deletionJobs` | Operational ledger | Entire lifecycle | TTL **OWNER CONFIRMATION REQUIRED** |
| `retiredPhones` | Retained after deletion | Anti-abuse | |
| Local SQLite | Retained in grace; purged on final detection | Device policy B | |
| `ueidIndex` retired | Retained as retired | Prevent restore of old UEID binding | |
| Email index | Marked deleted / unverified | Final deletion | Not fully erased necessarily |
| Local SQLite | No automatic cloud-driven wipe found | Uninstall / local purge / future UX | |
| Local notifications | Cancel when reminder/entry removed | Edit/delete entry | `notifications.ts` |
| Sync queue | Until ack / user purge | Sync engine | No max-age TTL found |
| Pincode cache | Cached until overwritten | PIN lookups | SQLite `pincode_cache` |
| Generated PDFs on device | Until user deletes / OS clears cache | User share/print | Not auto-uploaded by default (in-app privacy summary) |
| SecureStore session | Until sign-out / clear | Auth | |
| Draft boot snooze | Time-boxed snooze ms | AsyncStorage | Ephemeral UX |
| Dev reset tools | Dev-only wipe | Non-production | Must not appear as user deletion |

**Not found in repo:** Explicit backup retention periods; Cloud Logging TTL; Storage object lifecycle rules; anonymisation jobs beyond profile nulling; “delete within X hours of request” SLA.

---

## 2. Proposed retention decision table (FOR OWNER + COUNSEL — NOT IMPLEMENTED)

| Class | Proposed decision needed | Suggested questions |
|-------|--------------------------|---------------------|
| Active business records | Retain while account active? Cap inactive accounts? | |
| Security logs / Functions logs | How long? | |
| `retiredPhones` | How long after deletion? Legal basis? | |
| Email verification challenges | TTL? | |
| Support mailbox tickets | Operator email retention | |
| Device local after cloud delete | Prompt user to clear app data? | |
| Storage orphans | Job to delete `users/{uid}/**`? | |
| Firebase Auth users | Delete vs disable? | |
| Backups | Google default backups — disclose? | |

Do **not** publish invented TTLs.

---

## 3. Terminology alignment for policies

| Term | Meaning in this audit |
|------|------------------------|
| **Collect** | App or backend obtains or generates the data |
| **Process** | Any use/storage/transmission including by Firebase |
| **Share** | Disclosure to third party **other than** a service provider acting on instructions — OR Play “share” definition (counsel must map carefully) |
| **User-initiated sharing** | OS share sheet / email / WhatsApp by user |
| **Retain** | Keep after primary purpose or after deletion request |
| **Delete** | Erase or irreversibly de-identify app-controlled copies |
| **Optional** | Feature works without it / denial allowed |
| **Required** | Account or feature cannot proceed |
