# Approval D — Public submission and rollout

**Not authorized.** 18 October 2026 is a delivery target, not permission to
bypass gates or a promise of Play approval. Success metric: no known
unresolved critical/high security, data-loss, payment, account-isolation, or
core-flow defects — not a “bug-free” claim.

Approval A/B/C do **not** imply D.

---

## Required before public submission

1. Packet D / owner decision sheet: **pricing A recorded** (include in
   existing plans). Packet E real-store acceptance for that plan is **still
   required** before public commercial copy.
2. Retention: expiry **90+30 recorded** for source. Explicit deletion is
   **three facts** (implemented 15d / requested 180d / public UNRESOLVED).
   GRIN `grinEvidence/` is not in today’s purge prefixes. **Implemented**
   lifecycle + a public-approved deletion window still required.
3. Per-owner storage quota **proposed 1/5/20 GiB** pending Team 2 economics
   confirmation, then implementation. Do not advertise until confirmed.
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
| POL | Pricing A recorded. Storage 1/5/20 GiB **pending economics**. Explicit deletion public window **UNRESOLVED** (15d implemented vs 180d requested) |
| DEL | Deletion job does not purge GRIN Storage/Firestore; no production purge job this assignment |
| BCK | Live GRIN Functions absent; Rules additive undeployed |
| BLD | No Internal AAB this SHA; Play inventory **NOT RUN** 2026-10-06 (`support.vyd` ToS page; `aeadmin` lockout). EAS highest vc22 `72cb7254` git `0da2f58` is **not** this SHA |
| DEV | NATIVE_DEVICE / PLAY_INSTALLED **NOT RUN** |
| PAY | Restricted store billing **NOT RUN**; client purchase-entry `"0"`; live `PLAY_BILLING_ENABLED` **absent**; Pub/Sub topics **0**; Play catalog **NOT RUN**. Tester UID allowlist is **source only** (not on live Functions). RTDN still UID-ungated. |
| LIST | Privacy date mismatch (site 15 Jul vs app 27 Jul — do not backdate). `/~flock.js` Tinybird via first-party `/~api/analytics` (POST 202). Mailto deletion documented. Artwork git-tracked. Dashboard shots `safeForPublic: false`. Owner/tester must finish email+profile **before** review. Do not advertise unreachable GRIN. Keep 15-day deletion; do not ship 180-day pending as Play deletion. |
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
