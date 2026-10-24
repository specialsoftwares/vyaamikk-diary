# Later live inventory

This packet describes a later read. It is not permission to run one, and this change does not list or delete production data.

## Scope

- One uid that already has a deletion job.
- Read documents under `users/{uid}` and the nested collections the synthetic inventory already walks.
- Record unknown collections, missing parents, and paths deeper than the walker limit.
- Store the page as an inventory revision: scope `users/{uid}`, observed time, and the remaining paths.
- A claimed remaining count is accepted only when it matches that stored revision.

## Permission

- `datastore.entities.get` and `datastore.entities.list` on that database, limited to `users/{uid}`.
- No `datastore.entities.delete`.
- No `datastore.entities.create` or `datastore.entities.update`.
- No `datastore.databases.export`.
- No Storage delete and no KMS change.

## What stays separate

- Provider and backup evidence are recorded beside the inventory. They do not replace the remaining-path count.
- GRIN stays out of the purge while `INCLUDE_GRIN_IN_ACCOUNT_PURGE` is false.
- Completion of a held collection stays blocked until the stored inventory verifies and an operator reviews it.
