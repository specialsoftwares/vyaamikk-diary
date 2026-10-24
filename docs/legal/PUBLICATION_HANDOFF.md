# Privacy and Terms handoff — unpublished

This handoff is ready for the website publisher. Publication of `https://vyaamikk.specialsoftwares.com/privacy` and `https://vyaamikk.specialsoftwares.com/terms` was not performed and is not verified. The app still opens those URLs. It does not fetch them during boot, and it does not treat this repository draft as the accepted live policy.

Consent, privacy, and terms versions in `src/config/legal.ts` stay `1.0.0`. The effective date in that file stays `2026-07-27`. Do not bump them until the live pages contain the published text and a new acceptance is intended.

## Publish from

- Privacy: `docs/legal/PRIVACY_POLICY.md`
- Terms substance already prepared in `src/content/legal/documents.ts`, including the sentence that business insights, device-counted party totals, and statutory prompts are not a certified ledger, profit statement, or tax report, and are not professional advice.
- Operator, address, grievance officer, support mailbox, and URLs must match `src/config/legal.ts` and `src/config/brand.ts`.

## Crosswalk

| Topic | Routine UI | Terms draft | Privacy draft | Live website |
| --- | --- | --- | --- | --- |
| Non-certification of insights, party totals, and statutory prompts | Removed from those screens. Official-portal check for statutory dates stays in VyaaFlow. | Present in the feature-specific section. | Records and totals are described as the user’s documents, not a hosted certified ledger. | Not verified. |
| Device-counted party and insights figures | Short factual line kept. | Present. | Present, including that the server projector is off. | Not verified. |
| Camera, location, deletion, crash-report consent | Kept as their own controls. | Deletion grace stays described without a new period. | Present: optional images, no background location or map in this candidate, 45-day deletion window, optional Crashlytics. | Not verified. |
| Account deletion path | Settings → Account & Security. | Not a substitute for the privacy deletion section. | Present, plus the configured deletion URL. | Not verified. |
| Crash reports | Optional switch. Auto collection stays off in `firebase.json`. | Not a privacy disclosure. | Present. No account-derived identifier. Not described as anonymous. | Not verified. |
| Historic PDFs | Not rewritten. | New documents use “Created using Vyaamikk Diary.” | Exported files cannot be recalled. | Not applicable. |

Adding the Terms sentence does not publish the Privacy page. The external documents must be checked after publication before anyone says they contain this text.
