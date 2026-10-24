# Ten-state UX audit — letterhead + unified Material Movement (first pass)

Date: 2026-10-08 · SOURCE audit against integrated tree. Not device acceptance.

Reuse: `EmptyState`, `ErrorState`, skeletons / `useLoadingSlowWarning`, `useIsOnline` (unknown ≠ confirmed), banners, session/outbox ownership.

| Screen | State | File/handler | Actual behavior | Reproduction | Severity | Correction | Test boundary | Result |
|---|---|---|---|---|---|---|---|---|
| Letterhead setup | loading | `letterheadSetupEditorRuntime.load` | `loading` true during get | setOwner with deferred get | — | retained | runtime test | PASS SOURCE |
| Letterhead setup | error | `load_failed` + Retry | Banner + retry | get throws | release | retained | runtime test | PASS SOURCE |
| Letterhead setup | session expired | ownership fence | stale load/save ignored | A→B | release | retained | runtime test | PASS SOURCE |
| Letterhead setup | validation | need_image | error without wipe | save without image | — | retained | runtime | PASS SOURCE |
| Letterhead setup | success | save flight | single-flight | double save() | release | retained | runtime | PASS SOURCE |
| MM picker | empty N/A | destinations list | always options | — | — | unified destinations | destinations test | PASS SOURCE |
| GRIN create | validation | required supplier/material | error banner | empty save | — | lean form | manual/SOURCE | OPEN MOUNTED |
| GRIN create | double tap | busy guard | second press ignored | rapid save | release | busy flag | SOURCE | PASS SOURCE |
| GRIN return select | loading | list() | loading text until list returns | focus | — | select body | SOURCE | PASS SOURCE |
| GRIN return select | no results | filter | empty copy (not “no records exist” globally) | query miss | — | select body | search test | PASS SOURCE |
| GRIN return select | error / session | list throws | unavailable / retired | retire session | release | select body | SOURCE | PASS SOURCE |
| GRIN return | partial fail | per-line status | some ok/failed; no claim all succeeded | one line invalid | release | return body | SOURCE | PASS SOURCE |
| GRIN return | replacement | banner | return ≠ replacement stock | always | release | copy | SOURCE | PASS SOURCE |
| Network unknown | connectivity | `useIsOnline` | permissive true start | cold boot | polish | do not claim server available from boolean | OPEN | OPEN |
| Boot/OTP / billing / deletion | — | existing | not reopened | — | — | out of MM delta | — | deferred |

Release-blocking vs polish: letterhead ownership/save/load and MM unified entry/return honesty are release-scoped for this candidate. Network-unknown presentation polish remains open, not reopened as letterhead defect.
