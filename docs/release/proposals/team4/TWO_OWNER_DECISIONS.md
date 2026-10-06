# Two remaining owner decisions (Team 4)

**Do not reopen** GRIN-in-existing-plans (Starter / Professional / Business).
That choice is already recorded (2026-10-06). Packet E real-store acceptance
is still required before public commercial copy.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t4-product`  
Combined READ-ONLY HEAD: `aea65c1`  
Application SHA: `520f9f9` (no AAB of this SHA)  
CI: `37425360211` on `0d7aa17`  
Client purchase-entry: **`"0"`** (unchanged).

This file is an index. **Choices stay blank** until the owner writes them
on the sheets named below. Team 4 does not fill the rows.

---

## Decision 1 — explicit account deletion (public window)

Sheet: `DELETION_15_VS_180_OWNER_SHEET.md`

**Three facts — do not collapse:**

1. **Implemented** = **15 days** (code + live `/privacy` and `/delete-account`).
   This is **not** “the owner already chose 15.”
2. **Owner requested** = **180 days** of recoverability after an **explicit
   account-deletion request**. Not implemented. Not legally/Play approved.
3. **Final public-approved policy** = **UNRESOLVED**.

Choices **A / B / C / D** on that sheet stay **blank**. **P8 remains open.**
Do **not** substitute **30** (that is expiry notice in 90+30). Changing
`DELETION_GRACE_MS` does **not** implement a safe 180-day deletion policy.

Keep three clocks separate: explicit account deletion ≠ subscription/GRIN
expiry (90+30) ≠ optional recoverable archive (separate product).

Play User Data (fetched 2026-10-06): temporary deactivation, disabling, or
“freezing” **does not qualify** as account deletion.

---

## Decision 2 — GRIN retained-storage caps (ONE table)

Sheet: `STORAGE_OWNER_CHOICE.md`

Present **both**; pick **one** (or leave UNRESOLVED):

| Option | Starter | Professional | Business | In source |
|---|---|---|---|---|
| **1 — original proposal** | 1 GiB | 5 GiB | 20 GiB | Wired, labelled pending confirmation. **Do not advertise.** |
| **2 — smaller alternative** | 256 MiB | 1 GiB | 5 GiB | Named, **not** the live cap. **Not guaranteed profitable.** |

Do **not** silently replace 1 / 5 / 20. GCS bucket location remains
**UNKNOWN**. Cost assumptions and user trade-offs are on the storage sheet
(Team 2 `STORAGE_ECONOMICS.md` on combined).

---

## Not these decisions

- Activate `PLAY_BILLING_ENABLED`, create Play products, Save listing,
  publish website, or submit — **HOLD**.
- Play catalog / prices / license testers — **NOT RUN**.
- Reviewer onboarding on an installed `520f9f9` binary — **no such AAB**.
