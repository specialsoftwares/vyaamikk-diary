# Rules delta — age is not authorization

Source authorization outcome: `ef9c77f467c4fab8a279f6d68cb20d470fccce96` (`ef9c77f`, Fix consent ownership, crash activation, and age-independent onboarding authorization).

This note compares that outcome with the rules in this worktree and with `docs/release/rules-compat`. It does not replace those compat files.

## Live deployment was not performed

No Firebase deploy was run. Firestore rules, Storage rules, and Cloud Functions were not published. `docs/release/rules-compat/**` was read and left unchanged. Do not treat this file as approval to deploy.

## Conjunct removed

The only rules change is the active-user age conjunct. Owner checks, authenticated-session checks, `status == 'active'`, `restoreClaimAllows`, and deletion fences stay.

Removed from `isActiveUser` in `firestore.rules` and `rules/activated/firestore.rules`:

```
&& userData(uid).get('ageEligibility', '') == 'eligible'
```

`isActiveUser` is now:

```
isOwner(uid)
&& userStatus(uid) == 'active'
&& deletionJobAllowsActivity(uid)
```

`isOwner` still requires a signed-in session and `restoreClaimAllows`.

Removed from `ageEligible` in `storage.rules` and `rules/activated/storage.rules`:

```
&& firestore.get(userPath).data.get('ageEligibility', '') == 'eligible'
```

`ageEligible` still requires the user document to exist and `status == 'active'`. `canWriteOwnedObject` is still `isOwner(userId) && ageEligible(userId) && deletionAllowsStorage(userId)`. `isOwner` still requires `restoreClaimAllows`. The helper name was left in place so match paths did not need to change.

`protectedIdentityFieldsUnchanged` still requires:

```
request.resource.data.get('ageEligibility', '') == resource.data.get('ageEligibility', '')
```

A client still cannot forge `ageEligibility` to `eligible`. Demographic age is not written by the client profile patch.

## Comparison with docs/release/rules-compat

| Artifact | Active-user helper | Age conjunct | This change |
| --- | --- | --- | --- |
| `rules-compat/baseline/firestore.rules`, `proposed/firestore.rules`, `live-export-2026-10-06/firestore.rules`, `proposed-grin/firestore.rules` | `isOwner(uid) && userStatus(uid) == 'active'` | already absent | not edited; not copied over repo rules |
| Repo `firestore.rules` and `rules/activated/firestore.rules` | owner, active status, and `deletionJobAllowsActivity` | removed in this change | deletion and restore fences kept |
| `rules-compat` baseline and live-export storage | owner write, no age helper | already absent | not edited |
| `rules-compat/proposed-grin/storage.rules` | `ownerUserActive` is owner plus `status == 'active'` | already absent | not edited; `generationBind` and GRIN object paths untouched |
| Repo `storage.rules` and `rules/activated/storage.rules` | document exists, active status, owner, restore, deletion | age line removed | match paths unchanged |

Repo rules are not the live compat snapshot. Live compat `isActiveUser` also omits `deletionJobAllowsActivity`. This change does not drop that fence and does not copy the compat files into the repo rules.

## GRIN and attachment paths

GRIN match blocks were not modified. Repo `firestore.rules` and `storage.rules` have no GRIN `generationBind` paths; those stay only in the unedited `docs/release/rules-compat/proposed-grin` copies. Letterhead, attachment, and pdf `match` blocks were not edited. `functions/src/goodsEvidence` was not edited. Seal and open still call `assertBusinessAgeAdmitted`, which now admits an active owner with no demographic age band and still rejects a missing or inactive account.
