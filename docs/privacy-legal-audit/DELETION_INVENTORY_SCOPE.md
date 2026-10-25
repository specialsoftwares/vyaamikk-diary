# Later live inventory

This packet describes a later read. It is not permission to run one, and this change does not list or delete production data.

## Scope

- One uid that already has a deletion job.
- Read documents under `users/{uid}` and the nested collections the synthetic inventory already walks.
- Record unknown collections, missing parents, and paths deeper than the walker limit.
- Store the page as an inventory revision: scope `users/{uid}`, observed time, and the remaining paths.
- A claimed remaining count is accepted only when it matches that stored revision.

## Permission

Firestore IAM does not enforce a document path. `datastore.entities.get` and `datastore.entities.list` apply to the database. A condition on `users/{uid}` is not something this IAM role can promise, and this packet does not claim one.

The restriction that can actually be granted is:

- A service account with `datastore.entities.get` and `datastore.entities.list` on the database.
- No `datastore.entities.delete`, no create, no update, and no `datastore.databases.export`.
- The inventory function, not the IAM role, queries only `users/{job.uid}` for the job it was given.
- No Storage delete and no KMS change.

Security rules can limit a client to `users/{uid}`. They are not a substitute for the service account's database-wide list permission.

## What stays separate

- Provider and backup evidence are recorded beside the inventory. They do not replace the remaining-path count.
- GRIN stays out of the purge while `INCLUDE_GRIN_IN_ACCOUNT_PURGE` is false.
- Completion of a held collection stays blocked until the stored inventory verifies and an operator reviews it.
