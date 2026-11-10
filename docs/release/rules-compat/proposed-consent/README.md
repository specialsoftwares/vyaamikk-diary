# Proposed Firestore release — processingPurposes listener

Baseline: serving Firestore ruleset `5ec37bc5-7407-437f-a567-3faaa6b0bbb7`
(sha256 `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b`,
updated 2026-10-06), identical to `docs/release/rules-compat/proposed-grin/firestore.rules`.

Additive change only:

| Path | Client |
| --- | --- |
| `users/{uid}/processingPurposes/{purposeId}` | owner read; write denied |
| `users/{uid}/processingPurposeEvents/{operationId}` | deny |

Preserved from the serving baseline: owner profile/entry access, active-user
writes, deletionJobs deny, mailbox/index denies, and GRIN owner-read matchers.
This file does **not** introduce the larger candidate root `firestore.rules`
session/restore suite. Root `storage.rules` are not part of this release.

Proposed artifact sha256:

`d5127a7696118be13e73f328d5bc6dae975c903762a1e1661bfa507ced56c10d`

Rollback: republish ruleset `5ec37bc5-7407-437f-a567-3faaa6b0bbb7`.

Local gate: `npm run test:processing-purpose-rules-emulator`.

Deploy after the companion Functions (`recordProcessingPurpose` and the scoped
set) are planned for the same release. Do not deploy Storage rules from the
repo root.
