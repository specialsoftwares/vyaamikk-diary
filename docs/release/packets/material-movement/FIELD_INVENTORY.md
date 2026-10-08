# Unified GRIN field inventory

Date: 2026-10-08 · Candidate branch `feature/unified-material-movement-aso` · base merge `1be1dae`

| Field | Current purpose | Domain requirement | Default / source | Presentation | Compatibility |
|---|---|---|---|---|---|
| buyer legalName / GSTIN | Receiving business identity | Snapshot on receipt | Profile-prefill deferred; user editable | Visible summary | Required name fallback `not_supplied` label |
| supplier name / reg / GSTIN | Counterparty | Snapshot; do not infer reg from missing GSTIN | User | Visible | Unchanged |
| lines description / qty / unit | Material received | Valid quantity; stable line IDs | User; unit default `bags` (existing) | Visible | Multi-line create still single line_1 in create UI (return supports multi) |
| invoice / challan / PO | Delivery reference | Optional; unknown explicit | User | Visible + advanced | Unchanged |
| warehouse / bin | Location | Optional unless ops require | User | Warehouse visible; bin advanced | Unchanged |
| custody | Gate disposition | Distinct from QC | `received` | Visible | Unchanged |
| damage / condition | Optional inspection note | Not inspected ≠ accepted | User | Visible | Unchanged |
| EWB / transport / weights / packages / ack | Optional evidence | Unknown ≠ none ≠ N/A | Defaults unknown/not_supplied | Advanced | Unchanged |
| reportedArrivalAt | Arrival observation | Required string timestamp today | Capture clock **or** optional date @ noon IST | Optional date UI only | Date-precision documented; full ArrivalObservation schema **deferred** |
| reportedArrivalTimeZone | TZ for arrival | Required with arrival | Asia/Kolkata when date set; else default | Hidden | Unchanged |
| captureProvenance | Capture condition | Enum online/offline/late_entry | System default `offline` (UI no longer solicits) | Hidden | `unknown` provenance **deferred** (validator set unchanged) |
| capturedAtClientUtc | Device capture clock | Required | mint on draft | Hidden | Unchanged |
| GRIN number | Server issuance | Server only | Pending copy in detail/PDF | Removed from create header | Unchanged |
| online/offline badge / late-entry badge | Decorative | Must not invent late intent | — | Removed from create | Unchanged |

## Replacement semantics (documented decision)

Current domain `dispatchReturn` records a return quantity against a line. It does **not** create replacement stock or a completed replacement receipt. UI states this explicitly. Actual replacement arrival must be a **new** GRIN (consumes one issuance slot per established P3 policy). Atomic multi-line return command remains deferred; UI submits per-line `dispatchReturn` with refreshed `expectedVersion` and per-line status.
