# AUTH SECURITY EDGE CASE MATRIX

| Edge case | Expected | Source status |
|-----------|----------|---------------|
| Formatted phone paste | Reject | IMPLEMENTED (client) |
| Wrong mobile OTP ×3 | 15m lock that number | IMPLEMENTED (local-mock) |
| Resend | New version; old invalid | IMPLEMENTED (local-mock) |
| Cross-device latest login OTP | Prior superseded | PARTIAL (local-mock per process; Firebase phone provider-dependent) |
| `000000` outside local-mock+flag | Reject | TESTED |
| Shared-dev `000000` | Reject | IMPLEMENTED |
| Email leading space | Reject | IMPLEMENTED |
| Email Back during send | Block until settle | PARTIAL (email still start-then-navigate; further UX TBD) |
| New device security email gate | 10s provider accept | EXTERNALLY BLOCKED |
| This wasn’t me link | Signed 1h single-use | EXTERNALLY BLOCKED / not fully built |
| Offline >24h | Read-only | Policy IMPLEMENTED; mutation gates PARTIAL |
| Root/jailbreak | Block login | Abstraction IMPLEMENTED; SDK EXTERNALLY BLOCKED |
| 21d quarantine | Neutral message | Policy IMPLEMENTED; server enforcement PARTIAL |
| Profile without image | Block complete | NOT STARTED / PARTIAL product gap |
| Review page | Dedicated screen | NOT STARTED |
| Dashboard first action freeze | Zero | Prior fix `4db7c86`; keep regression tests |
