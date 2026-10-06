# Team 5 proposals (Wave 1)

QA artefacts. Not production implementations. Not G6 completion.

| File | Purpose |
|---|---|
| `WAVE1_CONTRACT_REVIEW.md` | Independent reading of the Wave 1 contract + `ports.ts` |
| `WAVE1_IMPLEMENTATION_REVIEW.md` | Independent reading of T1–T4 diffs + executed tests — **not G6**, not merge-to-main |
| `WAVE1_FINDINGS_REREVIEW.md` | Re-review of M1–M3/L4 — **not G6** |
| `WAVE2_ER45.md` | ER-4 GRIN-off v9→v10 QA + ER-5 CS executed vs open — **Wave 2 not accepted** |
| `WAVE2_W2_REPRO.md` | PHASE 1 independent W2-01…W2-05 reproductions at `6b26903` — **not closure** |
| `WAVE2_PHASE2_REVIEW.md` | PHASE 2 re-execution after T1–T4 landings — inspected defects no longer reproduce; **Wave 2 not accepted** |
| `WAVE2APP_F5_REVIEW.md` | Independent F1–F4 production-path review on combined `7623eef`; **Wave 2 / public release / G6 not accepted** |
| `WAVE2EVIDENCE_E1_E5_REPRO.md` | Independent E1–E5 evidence-workflow reproductions on combined `41670aa`; **Wave 2 not accepted** |
| `WAVE2EVIDENCE_E1_E5_REREVIEW.md` | PHASE 2 independent rereview of corrected combined `ae0339a`; E4 remaining; **Wave 2 not accepted** |
| `WAVE2EVIDENCE_E4_HASHER_FOLLOWUP.md` | PHASE 3 independent follow-up of E4/hasher at coordinator closeout `d4b6e1f`; **Wave 2 not accepted** |
| `WAVE2EVIDENCE_E1_JOINED_FOLLOWUP.md` | PHASE 4 independent re-execution of joined persistGrinOwnerSession → Functions-emulator at `cd5b5f4`; **Wave 2 not accepted** |
| `WAVE2EVIDENCE_FILEIO_PACK.md` | Independent file-IO + complete-pack review at `2cbacff`; **Wave 2 not accepted** |
| `WAVE2EVIDENCE_CONFIRMATION_REFRESH.md` | Independent confirmation-refresh after evidence linkage at `dcc325a`; **Wave 2 not accepted** |
| `RELEASE_CANDIDATE_GATE_REVIEW.md` | Independent release-candidate gate of application `dcc325a` plus packets A–E / T2 / listing / secret-scan / closure checklist; **Wave 2 not accepted** |
| `PACKAGING_SLICE_REVIEW.md` | Independent review of production Admin composition at `84c748d`; emulator evidence; **Wave 2 not accepted** |
| `ADMIN_CONFIG_RESOLUTION_REVIEW.md` | Independent reproduction of the `84c748d` project/bucket resolver failure and inspection of the fail-closed correction; **Wave 2 not accepted** |
| `INTERNAL_GRIN_SOURCE_WIRING_REVIEW.md` | Independent seven-export / lazy compose / Internal-GRIN flag / undeployed Rules review at `4409366`; **Wave 2 not accepted** |
| `INTERNAL_GRIN_PREFLIGHT_PACKET_REVIEW.md` | Independent packet + guarded-tooling review at `520b42b`; **Wave 2 not accepted** |
| `INTERNAL_GRIN_OPS_GUARD_REVIEW.md` | Independent A/B reproduction of ops-guard inspection/live-isolation defects and the fail-closed correction; **Wave 2 not accepted** |
| `RELEASE_COMPLETION_QA.md` | Independent release-blocking QA at application `5d5df3d` / tooling `228a8f5`; 2026-10-06 continuation; public deletion/retention SOURCE FAIL; issuance allowance SOURCE FAIL; **Wave 2 not accepted** |
| `POLICY_QA.md` | 2026-10-06 owner-policy vs `5d5df3d` source; 15 vs 180 vs unresolved; artwork hashes; Team 2 not reviewed |
| `public-deletion-retention.regression.test.mjs` | Expected-FAIL SOURCE regression: GRIN not in purge; 180 not implemented |
| `issuance-monthly-allowance.regression.test.mjs` | Expected-FAIL SOURCE regression: register does not consume monthly allowance |
| `POLICY_QA_T2.md` | Independent T2 review at `b845e8a`; **P3 PASS** on production register INJECTED; **P8 FAIL** |
| `S1_S2_PRE_FIX.md` | Independent INJECTED G2 adapter reproduction of S1/S2 at `b845e8a`; **WAITING_FOR_FIX**; P3 unchanged ACCEPTED |
| `s1-s2-pre-fix.injected.ts` | Pre-fix harness: exit 0 means defects reproduced, not a product pass |
| `S1_S2_POST_FIX.md` | Independent INJECTED + named G2 EMULATOR review at `520f9f9`; **S1/S2 PASS** at that boundary; P3 ACCEPTED; P8 FAIL; GHA/device/live **NOT RUN** |
| `s1-s2-post-fix.injected.ts` | Post-fix adapter harness |
| `s1-s2-post-fix.emulator.ts` | Post-fix Firestore emulator harness (`127.0.0.1:8091` / `demo-vyaamikk-grin-g2`) |
| `CLOSEOUT_0d7aa17.md` | Pin + SOURCE CI review at `0d7aa17`; TOOLING+SOURCE CI PASS; P3 ACCEPTED; P8 FAIL; not device/live |
| `REVIEW_56f2040.md` | Independent QA of application `56f2040` (T2 capacity/cleanup vs freeze `520f9f9`); **P8 FAIL**; S1/S2/P3 preserved; device/live/billing/public **NOT RUN** |
| `REVIEW_313025f.md` | Independent QA of application `313025f` (1/3/10 GiB + 45-day vs `56f2040`); SOURCE+INJECTED **PASS**; **P8 FAIL**; pin STALE |
| `REVIEW_ad72d79.md` | Independent QA of T2 provenance `ad72d79` (same slice as `313025f`); historical worktree review |
| `REVIEW_fcda7cd.md` | Independent QA of application `fcda7cd` (restricted Play testers vs `313025f`); SOURCE+INJECTED **PASS**; **P8 FAIL**; pin STALE; GRIN ≠ billing |
| `REVIEW_OWNER_CHOICE_CHECKLIST.md` | Pre-landing assertions for 1/3/10 + 45-day |
| `wave2evidence-e1-e5-repro.ts` | SQLITE_HOST / INJECTED / host-filesystem drivers for E1–E5 |
| `wave2evidence-e1-e5-rereview.ts` | PHASE 2 persistGrinOwnerSession inspection + unset-host failure |
| `wave2evidence-e4-hasher-followup.ts` | PHASE 3 persist hasher / conversion persist / SHA-256 inspection |
| `wave2evidence-e1-joined-followup.ts` | PHASE 4 persist wiring inspection + unset-host failure |
| `wave2evidence-fileio-pack.ts` | File-IO / pack wiring inspection + unset-host failure |
| `wave2evidence-confirmation-refresh.ts` | Confirmation-refresh wiring + HOLDs + Packets A/B + unset-host failure |
| `wave2-w2-repro.ts` | PHASE 1 SQLITE_HOST / INJECTED / mounted-inert drivers |
| `wave2-phase2-repro.ts` | PHASE 2 re-execution of the same findings |
| `wave2-w2-04-rules.emulator.ts` | Isolated STORAGE_EMULATOR original-read (PHASE 1 deny / PHASE 2 retained) |
| `G1_C9623DD_OBSERVATIONS.md` | G1 parent vs four accepted corrections — **not approval** |
| `SCOPE_SCAN_WAVE1.md` | SEC-05 honest scan of this branch's GRIN scope |
| `package.json.test-grin-acceptance-ids.md` | Proposed test script; coordinator-owned file not edited |
