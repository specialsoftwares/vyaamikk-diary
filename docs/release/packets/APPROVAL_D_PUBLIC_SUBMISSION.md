# Approval D — Public submission and rollout

**Not authorized.** 18 October 2026 is a delivery target, not permission to
bypass gates or a promise of Play approval. Success metric: no known
unresolved critical/high security, data-loss, payment, account-isolation, or
core-flow defects — not a “bug-free” claim.

Approval A/B/C do **not** imply D.

---

## Required before public submission

1. Packet D / owner decision sheet **written** for pricing (existing diary
   plan **or** separate GRIN SKU) **and** Packet E real-store acceptance for
   that plan.
2. Retention chosen in writing **and implemented** (delete-with-account or
   retain-for-a-stated-window). GRIN `grinEvidence/` is not in today’s purge
   prefixes.
3. Per-owner storage quota implemented, or written residual-cost acceptance.
4. Store-runtime + admission model that does not rely on Internal-only admit
   unless production is intentionally invite-only (that is not public).
5. Canonical GitHub `ci:verify` on the **public SHA** (not only `5d5df3d` if
   the tree moved).
6. Device checklist on the **production-track** binary (`PLAY_INSTALLED`),
   not only Internal / APK.
7. Listing / Data safety / reviewer instructions match **actual** public
   behavior. No founder inbox. No over-claims.
8. Main merge authorization (not implied).
9. Residual issues listed; monitoring; rollout controls (staged track,
   halt rule).
10. Least-privilege GRIN runtime identity decided (do not silently keep
    shared Editor for public GRIN without an explicit residual acceptance).

---

## Final binary (when it exists)

Record: SHA, CI run, versionName/versionCode, AAB sha256, mapping file,
signing role, resolved flags. A later material source/config change needs a
new binary.

---

## Residual known blockers (now)

| ID | Blocker |
|---|---|
| POL | Owner pricing/quota/retention blank |
| DEL | Deletion job does not purge GRIN Storage/Firestore |
| BCK | Live GRIN Functions absent; Rules additive undeployed |
| BLD | No Internal AAB this SHA; Play inventory stale (2026-10-01) |
| DEV | NATIVE_DEVICE / PLAY_INSTALLED **NOT RUN** |
| PAY | Restricted store billing **NOT RUN**; client purchase-entry `"0"`; live `PLAY_BILLING_ENABLED` **absent**; Pub/Sub topics **0**; Play catalog **NOT RUN** (no androidpublisher scope) |
| LIST | Privacy date mismatch (site 15 Jul vs app 27 Jul); `/~flock.js` vs “no third-party analytics”; delete page is mailto |
| IAM | Shared Editor residual on identity/deletion/billing SA |
| W2 | Wave 2 not accepted |

Encrypted backup: backlog. No live 2B/EWB/GST eligibility claims.

---

## Rollout controls (when authorized)

- Production track staged / country / percentage as owner writes.
- Halt: billing incident, data-loss, cross-account, or launch crash.
- Monitoring: Crashlytics (consent), Functions errors, Storage growth.
- GRIN public UI off until admission/quota/retention exist.

STOP until the owner approves this packet **after** A–C evidence exists.
