# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

The installed app is Expo SDK 54 (`expo` in package.json). Do not upgrade the SDK to match this documentation URL.

# Integration branch

`main` is the production source branch. `integration` is the only active branch for features, fixes, and refactors. Fetch and merge `origin/main` into `integration` before new work. Do not force the two branches to the same commit, and do not discard unfinished integration work.

A pull request from `integration` to `main` promotes every commit on `integration`, not only the latest fix. Keep that pull request draft until the included work is accepted. Do not merge it, deploy Functions or rules, change activation flags, or start a public release unless that step is explicitly requested.

Do not delete older branches to make the `integration` name available. `origin` already has `integration/release-privacy-candidate`, and Git cannot store a branch named `integration` beside it until that ref is renamed or retired by an explicit repository decision.
