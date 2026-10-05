# Additive GRIN Rules merge (undeployed)

Not live. Do not `firebase deploy` from this directory. `firebase.json`
still points at repo-root `firestore.rules` / `storage.rules`.

Merge base is the 2026-10-01 live export, which already matches
`docs/release/rules-compat/proposed/` (billing-off compat):

| Artifact | sha256 |
|---|---|
| Live / proposed Firestore | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| Live / proposed Storage | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` |
| Merged Firestore (`firestore.rules`) | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Merged Storage (`storage.rules`) | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` |

Repo-root `firestore.rules` (`233b05b7…`) is the quota suite and is **not**
the live replacement. Repo-root `storage.rules` (`19fcc761…`) also differs
from live; do not overwrite live from the repo root.

Client GRIN writes stay denied. Admin SDK / Functions adapters remain the
writers. Storage GET of a retained original is not a full-app export.
