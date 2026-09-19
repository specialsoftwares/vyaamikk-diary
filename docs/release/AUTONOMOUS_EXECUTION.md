# Release execution charter

Status: active working instructions for isolated development; no release approval.
Owner direction: continue independently within the boundaries below instead of stopping all development after each review handoff.
Recorded: 2026-09-19. Revalidate live refs and evidence on resume.

## Purpose and authority

Keep useful development moving while credentials, external review or device testing are blocked. A blocked task blocks only its dependent work.

This charter and RELEASE_REGISTER.json track execution and evidence for the existing release scope. They do not replace docs/PRODUCT_RELEASE_BACKLOG.md as the authority for feature promotion. Do not start its NEXT, LATER or PARKED features. Existing owner decisions and subsequent explicit instructions take precedence; record any change in authority.

Read repository AGENTS.md and applicable nested instructions before implementation. The current AGENTS.md links Expo 56 documentation while the reviewed integration candidate depends on Expo 54.0.36. Read the required documentation, establish the installed version, and use version-appropriate APIs. This discrepancy is not permission to upgrade Expo or dependencies.

## Non-negotiable boundaries

- PRs #20, #21 and #22 remain draft/HOLD. The proposed documentation PR must also be draft. No merge into main, auto-merge or branch-protection change.
- No EAS/native build, paid build-credit use, deployment, store mutation, production flag write, credential/key rotation, live backfill or migration.
- No modifications to the historical workspace /Users/shivamsaurav/Vyaamikk Diary or its dirty local-main/email-OTP work.
- Do not reset, force-push, discard, stash without agreement, or copy over intervening work. Preserve existing branches and worktrees.
- Do not enter or repeatedly retry passwords/2FA. The owner completes interactive sign-in. Do not create a second Play developer account or Firebase Android app.
- No secret values, signing material, purchase tokens, customer records or personal account details in the register, logs, captures or PRs.
- No fixture prices, mock OTP, bypassed bootstrap, debug attestation tokens or fabricated entitlement in a store candidate.
- No hiring, paid service purchase, outreach or change to commercial/legal facts under this charter.

Allowed now: read-only audits; isolated source fixes within current scope; focused tests and existing CI; local development runtimes/emulators; evidence captures; commits and draft PRs; factual progress on the relevant GitHub/Jira work items. Do not transition tickets to Completed merely because tests pass.

A future activation approval must identify the action, environment, candidate SHA/configuration, expected effect and recovery plan. Prepare those details before requesting it. Never treat an empty queue or passing CI as approval.

## Settled product and security contracts

Letterhead is free for every account and present/future pack for 12 months from each user's trusted signup. The parent and genuine diary mirror consume zero ordinary monthly quota. Access continues free until an owner-approved successor exists; no automatic anniversary charge, paywall or restoration of old quota rules. Do not reopen the two-slot or one-slot proposals. Do not refund or backfill historic usage.

Ordinary record families retain their quota controls. Preserve accepted content CAS, stable-ID replay, local recovery, reminder, session-generation and lease-ownership protections. Reopen them only for a demonstrated new failure or unavoidable changed dependency.

Keep IAP through the existing controller and server validation. No client entitlement authority, second purchase controller, raw-token persistence, client-side Android acknowledgement or manual trial callable. Preserve fail-closed backend gates, ordinary-family-only upsell, and the shared purchase/restore lock. Letterhead and background sync never open the quota upsell.

## Isolation and source selection

The intended documentation branch release/bounded-autonomy-register is the durable control location once published. GitHub branch creation was rejected with 403; no remote control branch or documentation PR has been created by this handoff. CURSOR_START.md describes the one-time setup. Start it from accepted origin/main and include no implementation from #20/#21/#22. Read it without merging it into a candidate.

- REL-01 and REL-02 work on the existing isolated integration branch/PR #22.
- Keep #20/#21 unchanged unless a demonstrated defect belongs there and is explicitly recorded as a scoped correction.
- For independent UI fixes, use a dedicated task branch/worktree from the remote commit that actually contains the failing screen. Record why that base was selected. Do not combine unrelated changes into #22.
- Historical Jira titles, local dirty main, preview APKs and EAS build history are not a release source of truth. Trace the real source commit.
- Inventory any required email-OTP or other unmerged work without importing it. A combined release manifest must name every included commit and unresolved dependency.
- Inspect node_modules realpaths before installing. Do not install through a symlink into another worktree. Use an isolated checkout with a real dependency directory and the committed lockfile.
- Only one task changes a given worktree at a time. Unrelated tasks must not edit another active worker's files.

## Execution loop

1. Read CURSOR_START.md, this charter and the register. Compare recorded refs with live refs. Inspect relevant worktree status and preserve intervening work.
2. Select the highest-priority task whose next action is authorized and whose dependencies are satisfied. Human sign-in is not a dependency for independent UI work.
3. State the concrete failure or unknown and acceptance criteria. A user report or stale document is a lead, not proof of a current code defect.
4. Reproduce before changing behavior. If already fixed in the current candidate, record exact evidence and move on. Avoid speculative refactors.
5. Make the smallest coherent correction. Run focused checks during edits. Review the diff against the acceptance criteria and preserved contracts.
6. For auth, Rules, billing, entitlement, sync ownership, migration or destructive behavior, prepare a separate review package. A fresh AI review can find more defects but is not human/security/device acceptance. No self-approval of a sensitive change.
7. Commit reviewable source and evidence. Push only to the intended task branch; keep PRs draft. Run the required canonical gates on a completed candidate, not after every small edit. Re-run only relevant gates during iteration; record exact final-head CI before acceptance.
8. Update the register, then select the next independent ready task. READY_FOR_REVIEW is a handoff state for that task, not a command to stop all development.
9. If a tool, permission or sign-in fails, record the exact blocker and one human action. Avoid repeating the same failed request. After two unsuccessful approaches to the same implementation/environment blocker, checkpoint and switch to independent work; return with new evidence, not blind retries.
10. Before context/usage exhaustion, save a resume checkpoint: current task, branch/head, dirty files, last command/result, next permitted command and blocked actions. Report completed, awaiting review, blocked and next-ready items separately.

Stop the whole run only if all remaining tasks are blocked, the owner asks, an access/safety incident makes continuation unsafe, or the runtime ends. Do not invent unrelated work to keep running. A tool's approval rejection is not permission to find a bypass; record its reason.

## Evidence and review

A task's workflow state and its validation state are separate:

- implementation: not_started / investigating / changed / no_change_needed
- review: pending / changes_requested / accepted (name reviewer and exact SHA)
- deployment: not_applicable / not_deployed / verified (environment, revision and time)
- device: not_run / failed / passed (installed build, device and cases)

Register workflow states: ready, in_progress, ready_for_review, blocked_human, blocked_dependency, verified, deferred. "verified" requires the task's actual acceptance evidence; it does not mean deployed or public-release ready.

For every substantive change record: before/after behavior, source SHAs, tests and failures inspected, exact test boundary, remaining limitations and next action. Distinguish helper tests, production orchestration with mocked I/O, mounted React, emulator, isolated web capture, native device and Play-installed validation. Never call an unmounted runtime test a mounted UI test.

Use deferred barriers for races. Add tests that can fail for the demonstrated defect, not tests that merely mirror the implementation. Do not weaken assertions, delete failing suites, force suite counts to match, disable CI, or relabel unexplained failures as flaky. Local Docker skip is a skip even if the wrapper exits zero. CI renderer success is separate evidence.

Freeze accepted items by SHA and evidence. Reopen only with a new reproduction, failed gate or changed dependency. Review remaining risks in batches so the same accepted code is not repeatedly redesigned.

Keep register updates on the documentation branch, sequentially and without force-push. Keep task code on its own branch. At each completed task, add concise evidence to its existing issue/PR when relevant; batch routine progress rather than posting every command. No automatic Jira completion.

## Release path

1. Prepare a coherent internal-candidate manifest and reviewed code. Inspect Play/Firebase/EAS read-only after owner sign-in. Select versionCode only from actual Play uploads.
2. Prepare the build/track operation for owner approval. A signed production AAB and an internal-track upload are separate actions; neither is authorized here.
3. After authorization, validate core Android flows on the installed candidate with production billing/quota activation unchanged. Identify what cannot be tested with those gates closed.
4. Prepare the separate billing test environment and activation proposal. Real purchase, restore, delayed/cancelled/refunded/revoked events and entitlement reconciliation must be validated before a paid public release.
5. Public release needs reviewed code, verified deployed backend/Rules, trusted auth, legal/store requirements, native core-flow/accessibility evidence and an approved staged rollout/recovery plan.

The first internal candidate need not wait for every VYD-38/39 enhancement, but critical subscription management and entitlement lifecycle behavior cannot be dismissed as optional. REL-12 determines that split without starting the full backlog. A billing-disabled public launch or a changed monetization promise is a separate owner product decision.

The full-app web SQLite/SharedArrayBuffer issue is deferred unless reproduced on Android or web enters the release scope. Isolated web previews are useful evidence for presentation, not an Android release prerequisite or native acceptance.

## Owner actions, batched

- Complete sign-in to the existing Play developer account/app. Do not create a new account.
- In a local interactive terminal, run firebase login --reauth, select the existing vyaamikk-diary project and verify read access. Never send passwords or tokens in chat.
- Confirm the actual legal entity/address, grievance officer/contact, operational support/deletion endpoints and counsel/CA review needs from the prepared fact sheet.
- Provide device/tester access and decide the concrete build/deploy/activation proposals when ready.

These actions do not stop the independent source queue. No public-release date is committed until account eligibility, external reviews and the installed candidate's results are known.
