# Owner decision sheet — GRIN pricing, quota, retention

Encrypted PDF backup = backlog. No “zero knowledge,” legal immunity,
automatic GST eligibility, or live 2B/EWB claims. Not legal advice.

**Do not reopen Q1 (GRIN in existing plans).** Recorded **2026-10-06** from
the consolidated owner policy mission. Those decisions authorize **source
implementation and tests**. They do **not** authorize live deployment,
billing activation, or Play publication.

Owner writes **2026-10-06** (this continue):

- Storage: **Starter 1 GiB / Professional 3 GiB / Business 10 GiB**. **Do not advertise.**
- Explicit deletion: **45-day** cancellation window after a confirmed request. **Supersedes 180.** Implemented still 15 until Team 2. Play freeze ≠ delete. `INCLUDE_GRIN_IN_ACCOUNT_PURGE` stays **false**.

Source of original options: `D_OWNER_POLICY_OPTIONS.md`.
Sheets: `STORAGE_OWNER_CHOICE.md`, `DELETION_45_PLAY_DISCLOSURE.md`.

---

## Q1. How do testers and later customers pay for GRIN?

**Owner choice: A — include GRIN in existing Starter, Professional and
Business subscriptions.** (Recorded 2026-10-06. **Do not reopen.**)

- No separate GRIN SKU at launch.
- Preserve existing approved prices; do not invent prices or trial terms.
- Source expected paise (not live Play display authority) remain
  `functions/src/billing/products.ts`: starter 9900 / 24900 / 79900;
  professional 24900 / 64900 / 199900; business 49900 / 129900 / 399900.
- Count **one newly issued GRIN** against the applicable plan **monthly
  record allowance** (free 25, starter 100, professional/business unlimited).
- Retry, amendment, QC, return, evidence attachment and reconciliation
  **must not** consume another issuance.
- Integrate atomically/idempotently with existing quota
  (`atomicBillableCreate` / `usageCurrent` / Functions register transaction).
- Preserve ordinary diary and letterhead quota behavior.

Internal Testing still uses **synthetic** evidence until lifecycle
implementation is reviewed. Public commercial copy still needs Packet E
real-store acceptance of the diary SKU. Purchase-entry stays `"0"`.

---

## Q2. What count/byte limits apply, and what happens at the limit?

**Behaviour recorded: B — per-owner retained-storage allowances**, plus
existing technical ceilings (warn 80/95; refuse at cap; no silent delete;
no overage). That framework is **not** reopened here.

**Owner choice 2026-10-06:** Starter **1 GiB** / Professional **3 GiB** / Business **10 GiB**.
Neither option 1 (1/5/20) nor option 2 (256 MiB/1/5 GiB). **Do not advertise.**
Source constants still 1/5/20 until Team 2 wires this table. GCS location **UNKNOWN**.

| Option | Starter | Professional | Business | Status |
|---|---|---|---|---|
| Original proposal | 1 GiB | 5 GiB | 20 GiB | Not selected |
| Smaller alternative | 256 MiB | 1 GiB | 5 GiB | Not selected |
| **Owner 2026-10-06** | **1 GiB** | **3 GiB** | **10 GiB** | **Selected. Not yet wired. Do not advertise.** |

Fill the row on `docs/release/proposals/team4/STORAGE_OWNER_CHOICE.md`.
Economics: combined `docs/release/proposals/team2/STORAGE_ECONOMICS.md`.

---

## Q3. Active accounts, expiry, deletion, export

Keep these clocks **distinct**. Do not substitute one for another.

### Active entitled accounts

Preserve issued GRIN records/evidence while the account remains entitled,
within the selected storage policy. No age-based purge. Corrections and
voids preserve history.

### Subscription expiry (owner-approved for source)

After entitlement **genuinely** expires:

1. Stop new paid issuance/uploads as applicable.
2. Provide **90 days** of read/download/export access.
3. Before a subsequent purge, provide a further **30-day** final notice.
4. Do not purge during valid entitlement or merely because one payment failed.
5. Renewal and retry must not race with deletion.
6. Deletion must not run without the required notice and eligibility evidence.

This is **separate** from an explicit account-deletion request.
**No production purge job** from this assignment. Source state machine +
tests only. Do **not** substitute 30 as the account-deletion window.

### Explicit account deletion — three facts (do not collapse)

Play / privacy worksheet: `docs/release/proposals/team4/DELETION_45_PLAY_DISCLOSURE.md`.

| # | Fact | Status |
|---|---|---|
| 1 | **Current implemented behavior** | `DELETION_GRACE_MS` = **15 days**. Live `/privacy` and `/delete-account` also describe 15 days. |
| 2 | **Superseded request** | **180 days** — **superseded** 2026-10-06. Do not implement 180. |
| 3 | **Owner policy 2026-10-06** | **45-day** cancellation window after a **confirmed** account-deletion request. Source not yet wired. Play: freeze ≠ delete. `INCLUDE_GRIN_IN_ACCOUNT_PURGE` stays **false** until separately approved. |

Changing `DELETION_GRACE_MS` from 15 to 45 implements the **pending-then-purge clock**. It does **not** by itself: enable GRIN purge, change subscription expiry (90+30), create a recoverable archive, or satisfy Play if the account is only frozen.

**Owner choice:** **45 days** (recorded 2026-10-06). Not 15. Not 180. Not 30.

### Exit and export

Before expiry-related purging or account deletion: offer a working way to
obtain **originals** and receipt/audit records. Current pack PDF is a
summary (`originalsBundled=false`). Do not call that summary a complete
archive. ZIP is optional; usable original downloads + record export are
required.

---

## Testers

Arrangement accepted: owner plus two trusted testers, separate accounts.
Identities, Firebase UIDs and devices still need owner input. Do not invent
them. No passwords/OTPs/tokens in the repository. Synthetic GRIN evidence
until lifecycle is implemented and approved.

---

## Implementation status (this Team 4 continue)

| Item | State |
|---|---|
| Q1 GRIN-in-existing-plans | **recorded** — do not reopen |
| Storage GiB | **1 / 3 / 10 selected** — not wired here; **do not advertise** |
| Explicit deletion | **45-day** owner policy; implemented **15** until T2; 180 superseded |
| Advertising GiB | blocked |
| Live Functions/Rules/IAM / Play catalog | HOLD / catalog **NOT RUN** |
| Production purge job | **not introduced** |
| Purchase-entry | **`"0"`** |
