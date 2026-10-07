# Team 4 → Team 3: accept `EvidenceCategory` on `attachLocalFile`

Contract E5 (`2026-10-02.wave2evidence`) extends declared originals with `stock_accounting`, `payment`, `gst`, and `return_document` in addition to Wave 1 categories.

Settled on combined: `WAVE1_ORIGINAL_CATEGORIES === UPLOAD_ORIGINAL_CATEGORIES`, so `attachLocalFile` / `isWave1OriginalCategory` already accept `stock_accounting`, `payment`, `gst`, and `return_document`. Screens use the same set via `GRIN_ATTACH_CATEGORIES`. Category remains an assertion, not GSTR-2B / payment proof. Trusted generation is `object_generation`, never the literal `"verified"`. SQLITE_HOST only. Not NATIVE_DEVICE.
