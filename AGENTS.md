# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

The installed app is Expo SDK 54 (`expo` in package.json). Do not upgrade the SDK to match this documentation URL.

# Integration branch

`main` is the production source branch. `integration` is the only active branch for features, fixes, and refactors. Fetch and merge `origin/main` into `integration` before new work. Do not force the two branches to the same commit, and do not discard unfinished integration work.

A pull request from `integration` to `main` promotes every commit on `integration`, not only the latest fix. Keep that pull request draft until the included work is accepted. Do not merge it, deploy Functions or rules, change activation flags, or start a public release unless that step is explicitly requested.

`archive/release-privacy-candidate` preserves `d3d40283af4b609aebaeb4b38b8578dc7d88e8cd`. The ref `integration/release-privacy-candidate` was removed only after that archive matched. Keep the archive. Do not delete unrelated branches.
