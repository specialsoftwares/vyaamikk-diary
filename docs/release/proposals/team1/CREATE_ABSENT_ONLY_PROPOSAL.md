# Proposal — `create-absent-only` / durable journal (not wired)

Not authorization. Does not rewrite
`docs/release/packets/grin-ops/grin-functions-op.mjs`. Mixed PRESENT/ABSENT
remains **stuck in the current helper** until a later owner-approved command
is wired. Planner module (fail-closed, no spawn):

`docs/release/proposals/team1/grin-functions-absent-only.mjs`

Tests: `node --test docs/release/proposals/team1/grin-functions-absent-only.test.mjs`

## Why the current helper is stuck

`gate-off-initial` is one firebase spawn of **all seven** and
`assertAllAbsent` aborts if any name is PRESENT or UNKNOWN.

`enable`/`disable` require **all seven PRESENT**.

A failed firebase seven-deploy can leave 3 PRESENT + 4 ABSENT. Then both
create and enable refuse. Do **not** blindly retry all-seven create (remote
no-dotenv merge can preserve a remote gate-on key on PRESENT names).

## Proposed later command (HOLD — not live, not in the guard `main`)

1. `inspect` (complete inventory required). UNKNOWN blocks.
2. Classify each of the seven: PRESENT / ABSENT / UNKNOWN.
3. If mixed: `create-absent-only` firebase `--only` **ABSENT names only**, same
   no-dotenv, same pin `5d5df3d…`, same CLI 14.20.0. PRESENT names stay out of
   `--only`.
4. If all ABSENT: keep using `gate-off-initial` (this planner refuses all-seven
   via the absent-only path).
5. If all PRESENT: enable/disable (separate approval).
6. Operator-supplied durable journal dir (`GRIN_OPS_JOURNAL_DIR`). Not the
   cleaned `grin-ops-*` temp. After each successful child, append one JSON line
   `{op, name, presence, revision_if_known, firebase_hash_if_known, at}` — **no
   env values**. Mid-loop gcloud failure must keep that journal (today the
   guard tool **deletes** the temp session in `finally`).

Planner already refuses: UNKNOWN, all-absent, all-present, empty `--only`,
`--only functions`, non-GRIN names, journal keys that look like env/token/secret.

## Wiring (later, still HOLD)

Do not add `create-absent-only` to the guard tool until owner approval names
the subset and the apply host. Prefer importing this module from a **new**
command file rather than expanding `grin-functions-op.mjs`.
