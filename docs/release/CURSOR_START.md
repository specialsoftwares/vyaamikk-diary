# Cursor start: bounded release execution

One-time setup: the ChatGPT GitHub connection rejected branch creation with 403 (Resource not accessible by integration). The three reviewed control files are supplied in the handoff package; the remote control branch/PR does not yet exist.

Using your existing authorized GitHub access, verify current main and create a separate control worktree and branch named release/bounded-autonomy-register from accepted origin/main. Add only the three supplied docs/release files and open a documentation-only draft PR. Do not modify main or implementation branches. If the branch now exists, inspect it and preserve intervening changes rather than overwriting it. Update the register's publication evidence with the real branch/PR result.

Do not change GitHub permissions, try alternate credentials, or treat publication failure as permission to bypass access controls. If your own authorized connection also cannot publish, record that blocker once, keep a local isolated control checkpoint and continue independent tasks whose normal source access remains available.

After setup, read the control files from origin/release/bounded-autonomy-register without merging them into main or the implementation candidates.

This is one continuing assignment. Finish each authorized task, checkpoint it for review, and continue with the next independent task. Do not wait for a ChatGPT response between routine tasks. All merge, build, deploy, store and production-flag holds remain.

## Before editing

1. Read repository AGENTS.md, docs/PRODUCT_RELEASE_BACKLOG.md, docs/release/AUTONOMOUS_EXECUTION.md and docs/release/RELEASE_REGISTER.json from the control branch.
2. Verify live refs and worktree state. Initial expected main is 79d405d0b626d5067a33541887ac3c70689b8724; #20 is 531a4cdb8e0fa9b099bbd712635a8840ecea0e39; #21 is 355f60aee10d46203baf35e60a8228338f72e34b; #22 is 30c848a2a2cc66746f1f92ad7a080cc8d3a81ece. Preserve intervening work and update evidence instead of resetting it.
3. Keep a separate control worktree for this documentation branch. Do not modify the historical /Users/shivamsaurav/Vyaamikk Diary or its local-main email-OTP work.
4. Use the existing integration worktree for REL-01. Preserve #20/#21. Independently reproduce reported UI defects before choosing isolated source branches.

## First task: REL-01, asynchronous IAP failure

Round 19 handles direct callback rejection and session retirement. A separate controller/mapper/runtime check observed this gap:

- purchase returns sheet_launched while IAP is still active;
- a later IapView reports an asynchronous recoverable verification failure;
- host reconciliation settles busy state;
- errorMessage is null and purchaseState is idle.

The earlier check used production bridge logic with injected IAP views, not a mounted React tree or a real store. Reproduce the real event sequence using production createIapSession connected to the production host/runtime, with native/store/backend I/O injected. First prove whether the current head still has the gap.

If reproduced, surface a newly received failure once to the owning current presentation/attempt. Preserve error acknowledgement across dismiss/reopen, session-generation retirement, old-completion isolation, real pending states and explicit retry. Do not globally replay lastResult and do not solve it with a second purchase controller. No entitlement writes or automatic purchase/save retry.

Run focused regression tests, then required final-candidate gates and exact-head Actions. Keep #22 draft/HOLD and record the review package. Continue with REL-02 and independent ready tasks while REL-01 awaits review.

## Remaining work selection

Use the register priority and depends_on fields. The initial queue includes:

- focused mounted host/dispatch evidence;
- Android raw translation key, stuck press and boot-label reproduction/fixes;
- auth/deployed-Rules/App Check source assessment and read-only checks;
- legal URL/configuration audit and an owner fact sheet;
- VYD-38/39 launch-critical scope assessment only;
- internal-candidate, device and store test preparation.

Play sign-in and Firebase reauthentication block their read-only account inspections, not unrelated development. OTP entry points already call the native implementation in the reviewed source. Do not rewrite them because an old readiness document claims wiring is missing. Existing website documentation describes a separate Lovable/Cloudflare repository; establish the actual host before proposing a deployment.

Do not add billing activation, native builds, future roadmap features or production operations to this assignment. Do not consume local-main email-OTP work as a shortcut.

## Save progress before yielding

Update the control register after each task/blocker. Include exact branch/head, evidence, review state, next action and any dirty work. Commit the control update separately from implementation. If updating the remote register is unavailable, save an isolated local checkpoint and report the access failure; continue authorized independent work.

Return one concise consolidated report covering:
- completed candidates and their evidence;
- items awaiting independent review;
- owner actions and exact blockers;
- next ready task and resume command;
- unchanged holds and remaining internal/public release gates.

The report is a progress checkpoint, not a requirement to stop if independent ready tasks remain.
