# Owner decision sheet — GRIN pricing, quota, retention

Encrypted PDF backup = backlog. No “zero knowledge,” legal immunity,
automatic GST eligibility, or live 2B/EWB claims. Not legal advice.

**Do not reopen Q1 (GRIN in existing plans).** Recorded **2026-10-06** from
the consolidated owner policy mission. Those decisions authorize **source
implementation and tests**. They do **not** authorize live deployment,
billing activation, or Play publication.

Two writes still blank (Team 4 product sheets — owner must fill the rows):

- Explicit deletion public window:
  `docs/release/proposals/team4/DELETION_15_VS_180_OWNER_SHEET.md`
- Storage GiB table:
  `docs/release/proposals/team4/STORAGE_OWNER_CHOICE.md`

Source of original options: `D_OWNER_POLICY_OPTIONS.md`.

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

**GiB table: still one owner write.** Do not silently replace 1 / 5 / 20.
Do not advertise. Do not call the smaller table guaranteed profitable.
GCS bucket location **UNKNOWN**.

| Option | Starter | Professional | Business |
|---|---|---|---|
| **1 — original proposal** (wired, pending confirmation) | 1 GiB | 5 GiB | 20 GiB |
| **2 — smaller alternative** (named, not the live cap) | 256 MiB | 1 GiB | 5 GiB |

**Owner choice (1 / 2 / UNRESOLVED):** _________________

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

Owner plain-language sheet (choices **A–D blank** until the owner writes):
`docs/release/proposals/team4/DELETION_15_VS_180_OWNER_SHEET.md`.

| # | Fact | Status |
|---|---|---|
| 1 | **Current implemented behavior** | `DELETION_GRACE_MS` = **15 days**. Live `/privacy` and `/delete-account` also describe 15 days. **Not** “the owner already chose 15.” |
| 2 | **Owner-requested policy** | **180 days** after an explicit account-deletion request. **Not** legally/Play approved. |
| 3 | **Policy approved for public operation** | **UNRESOLVED.** Do not advertise or activate 180 days. Do not silently substitute 15 or 30. |

Changing `DELETION_GRACE_MS` does **not** implement a safe 180-day policy.
Play User Data (fetched 2026-10-06): temporary deactivation, disabling, or
freezing **does not qualify** as account deletion. Optional 180-day
recoverability would be a **separate archive product**. **P8 stays open.**
Do not flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`.

**Owner choice (A / B / C / D):** _________________

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
| Storage GiB 1/5/20 vs 256 MiB/1/5 | **UNRESOLVED** — `STORAGE_OWNER_CHOICE.md` |
| 180-day public deletion policy | **UNRESOLVED.** A–D blank. Engineering hold at implemented 15 days is **not** a recorded owner choice |
| Advertising 1/5/20 GiB | blocked |
| Live Functions/Rules/IAM / Play catalog | HOLD / catalog **NOT RUN** |
| Production purge job | **not introduced** |
| Purchase-entry | **`"0"`** |
