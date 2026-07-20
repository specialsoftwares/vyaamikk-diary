# ACCOUNT DELETION TECHNICAL AUDIT

**Tip:** `f1019b6` · **Not a legal compliance certification.**

---

## 1. User-facing discovery paths (verified)

| Path | UI label (i18n key) | Internal route | Public legal copy may cite? |
|------|---------------------|----------------|----------------------------|
| Settings tab → delete row | `settings.deleteAccountAndData` | Navigates to `/(app)/settings/delete` | Cite **Settings → Delete Account & Data** only |
| Settings → About → Delete account | About screen push | Same delete screen | Cite **Settings → About → Delete account** |
| Web resource | `env.brand.accountDeletionUrl` default `https://vyaamikk.specialsoftwares.com/delete-account` | Browser | Yes |

**Do not** publish the internal path `/(app)/settings/delete` in Privacy/Play copy.

Evidence: `app/(app)/(tabs)/settings.tsx`, `app/(app)/settings/about.tsx`, `app/(app)/settings/delete.tsx`.

---

## 2. End-to-end flow (implemented)

```
User confirms in-app delete
  → markAccountPendingDeletion (Firestore/mock status pending_deletion + deletionScheduledFor = now+15d)
  → Access restricted / pending-deletion routing (AuthFlowGate codes)
  → During grace: production forbids simple cancelAccountDeletion; reactivation requires in-app email verification (not email-reply alone)
  → After grace: completeAccountDeletion callable OR scheduledDeletionCleanup (24h)
       → executeRetireIdentity: status deleted, phoneIndex delete, retiredPhones write, ueid retired, emailIndex marked, purge Firestore subcollections
```

Evidence: `markPendingDeletion.ts`, `identityLifecycle.ts`, `cancelDeletion.ts`, `functions/src/deletion/lifecycle.ts`, `reactivationRouting.ts`.

---

## 3. What is deleted / retained

| Asset | Immediate on request? | After grace? | Retained? | Confidence |
|-------|----------------------|--------------|-----------|------------|
| Account usability | Restricted (pending) | Deleted status | — | CODE VERIFIED |
| Profile PII fields | Pending state keeps data for reactivation window | Anonymize/null in client helper; server marks deleted | Minimal indexes | CODE VERIFIED |
| Firestore business subcollections | No (during grace) | Purged (batch limits) | — | CODE VERIFIED |
| Firebase Storage files | Not during grace | **Paged Admin purge** of `users/{uid}/letterhead|attachments|pdfs/` + verify empty (repo) | Soft-delete window **EXTERNAL** | CODE VERIFIED (source); deploy **EXTERNAL** |
| Firebase Auth user | Not during grace | **`deleteUser` after data phases**; missing user idempotent | — | CODE VERIFIED (source); deploy **EXTERNAL** |
| `deletionJobs/{uid}` | Created at pending | Tracks phases / lease / completion | Operational ledger — TTL **OWNER CONFIRM** | CODE VERIFIED |
| `retiredPhones` | Created at finalization | Kept | Yes (anti-abuse) | CODE VERIFIED |
| Local SQLite / files | Retained during grace | Purge on final-deletion detection (policy B) | Residual if app never relaunched | CODE VERIFIED |
| Exported PDFs / WhatsApp copies | Never controlled | Never | Outside app | CODE VERIFIED product rule |
| Local notification schedules | Cancel with record deletes; account-level sweep **not fully proven** | — | May stale | PARTIAL |
| Sync queue | User-scoped; may remain locally | — | Device | CODE VERIFIED |

---

## 4. Public web deletion resource

### Repo static `public-site/delete-account.html` (legacy)

- Instructs **in-app** deletion and **mailto** request to `support@specialsoftwares.in`.
- Does **not** programmatically initiate Firebase deletion.
- States 15-day grace.
- Contains TODO placeholders for grievance/address.
- Canonical/og URLs still reference `vyaamikkdiary.in` / `.in` — **outdated vs `.com` defaults**.

### Live Lovable page at `.com/delete-account`

**EXTERNAL VERIFICATION REQUIRED** — not in this repository. Mobile app only opens the configured HTTPS URL.

### Play policy mapping (issue-spotting)

Google Play requires apps with account creation to provide:

1. In-app deletion path — **present**.
2. External web resource to request deletion — **URL configured**; whether the live page meets “request deletion” (form vs mailto-only) must be verified on the live site.
3. Freezing alone is not deletion — grace period then purge is closer to deletion-with-delay; counsel must confirm disclosure adequacy. Pending state is temporary, not permanent freeze-as-substitute — **disclose grace clearly**.

Sources: [Play account deletion help](https://support.google.com/googleplay/android-developer/answer/13327111), [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311).

---

## 5. Reactivation

- Production: direct `cancelAccountDeletion` throws — must use reactivation with **in-app email verification code**.
- **Email reply alone is not sufficient** and must not be described as reactivation.
- Evidence: `cancelDeletion.ts`, Auth pending-deletion UI copy in locales.

---

## 6. Deletion gaps (ranked for risk register)

| ID | Gap | Severity hint |
|----|-----|---------------|
| D1 | No Storage object purge in Functions deletion | **Closed in repo** — deploy pending | P1 until deploy |
| D2 | No Firebase Auth user delete found | **Closed in repo** — deploy pending | P1 until deploy |
| D3 | Device local DB not wiped by cloud deletion | **Policy B documented + implemented** | P2 disclose |
| D4 | Live web page content/domain drift vs `public-site` and support email | Unchanged (website out of scope) | P1 disclosure |
| D5 | Cron purge batch limit 500/subcollection/pass | **Mitigated** — loop until empty + job paging | P2 residual ops |
| D6 | Grievance/support email inconsistencies | Unchanged | P1 trust/disclosure |

---

## 7. Failed / interrupted deletion

| Scenario | Observed design | Confidence |
|----------|-----------------|------------|
| Network fail after confirm | Pending write may fail → user sees error (UX dependent) | PARTIAL — device QA |
| Backend pending success, local remains | Expected | CODE VERIFIED |
| App kill mid-flow | Server status authoritative on next login | ASSUMED + routing code |
| Duplicate delete request | Idempotent pending patch likely | PARTIAL |
