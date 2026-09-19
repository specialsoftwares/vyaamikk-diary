# Isolated public Android combined candidate

Status: isolated draft branch only. Not merged to main. Original PRs #20–#25 remain intact.

## Parents

| Input | SHA |
| --- | --- |
| #22 (contains #20/#21) | `8adcd7b604257d00b43635e70d90e4e97e5bcd57` |
| #24 OTP EN/HI | `9db22faf09f81f79a96ca1d94bbc0c99d17ee05b` |
| #25 press-state | `5076f7707a4812437f74879c3767bf554b8eeabb` |
| Combination merge | `a3317148d6e24bc980bbe5637b65ecac84e45b0d` |
| Implementation (first assembly) | `5d148f355a82a6bfae8b176d101ebce0b9877d16` |
| Previously reviewed docs head | `6c46a7067269eed679d9079efcf2bb30d43a588f` |

Worktree: `/Users/shivamsaurav/vyd-worktrees/public-android-combined`  
Branch: `release/public-android-combined`  
Base: reviewed #22, then merged #24 and #25.

This continuation (PR #26 review corrections + remaining source) sits on top of `6c46a70`. Local `test:all` **139/139 PASS in 429.5s** (2026-09-19). `test:live-rules-compat` **LIVE_RULES_COMPAT PASS** including production save callers. Not merged to main. Fresh Actions required on the final SHA.

## Conflict union

`package.json` `test:i18n` keeps `consentLocale.test.ts`. `test:settings-presentation` keeps `luxuryPressable.contract.test.ts`. Translations: preserve all EN/HI keys from both sides.

Not included: dirty historical/local-main email-OTP work; re-application of #20/#21.

## Sequencing exception

Owner authorized isolated combination and VYD-38/39 + App Check source before preceding PRs merged. This does not accept those PRs for release. See `VYD38_SEQUENCING_EXCEPTION.md`.
