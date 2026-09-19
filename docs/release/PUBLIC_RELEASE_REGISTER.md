# Public Android release register

Fields are distinct. Source tests do not mark tickets complete. This assignment did not deploy or publicly release anything.

| Work | Source implemented | Independently reviewed | Deployed | Device-tested | Store-tested | Public-ready |
| --- | --- | --- | --- | --- | --- | --- |
| Isolated #22+#24+#25 combination | Yes — branch `release/public-android-combined`, merge `a3317148d6e24bc980bbe5637b65ecac84e45b0d` plus implementation HEAD on this branch | No | No | No | No | No |
| Live-Rules compatibility artifact | Yes — hashed baseline + proposed patch; emulator PASS 2026-09-19 | No (security-sensitive) | No | N/A | N/A | No |
| VYD-38 subscription management | Yes — Settings entry, screen, presentManual, billing-details callable (flag closed), Play manage URL, history reader, EN/HI | No | No | No | No | No |
| VYD-39 reconciliation consumer | Yes — leases/backoff/injected revalidation/scheduler/operator callable, flags closed | No | No | N/A | No | No |
| App Check source | Partial — native init attempt + JS module import; CustomProvider bridge **failed proof**; unenforced | No | No | No (needs store binary) | No | No |
| Play listing/legal drafts | Drafts only | No (owner/lawyer) | No Console submit | No | No | No |
| Original PRs #20–#25 | Unchanged, HOLD | Existing review state | No merge to main | — | — | — |
| Canonical `test:all` | Yes — **139/139 PASS** locally on this candidate (2026-09-19). Invoice-renderer Docker not part of `test:all`. | No GitHub Actions run on this SHA yet | — | — | — | — |
| Canonical `ci:verify` remainder | Local PASS: typecheck, lint:eslint, functions tsc, `test:live-rules-compat`, Firestore/Storage/phone/billing emulator suites, invoice-renderer **host** build+unit tests, `check:firebase-client` (gitignored `google-services.json` copies, not committed). Local skips: `npx expo config --type public` (`@react-native-firebase/app-check` plugin missing from shared `node_modules` symlink; do not npm-install into that symlink); invoice-renderer **Docker** (`docker` unavailable). GitHub Actions has not run on this SHA. | No | — | — | — | — |

HOLDs preserved: main merge, auto-merge, EAS/native build, live flags/secrets/IAM, store writes, upload, production backfill, public rollout, historical workspace email-OTP.
