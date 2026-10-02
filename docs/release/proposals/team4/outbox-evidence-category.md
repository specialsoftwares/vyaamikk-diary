# Team 4 → Team 3: accept `EvidenceCategory` on `attachLocalFile`

Contract E5 (`2026-10-02.wave2evidence`) extends declared originals with `stock_accounting`, `payment`, `gst`, and `return_document` in addition to Wave 1 categories.

Team 4 screens and `GrinApplicationRepository.attachOriginal` now validate with `isEvidenceCategory` / `GRIN_ATTACH_CATEGORIES`. `GrinOutbox.attachLocalFile` still uses `isWave1OriginalCategory` and throws `invalid_evidence_category` for the four extra values.

Please accept the same declared set (still an assertion, not GSTR-2B / payment proof) and persist the category on `grin_local_evidence_files.category`. Do not coerce unknown to `invoice`. Additive descriptor columns (`actual_sha256`, `mime`, `generation`, capture provenance) remain E3.

Team 4 pack tests SQL-insert the extra categories until this lands. SQLITE_HOST only. Not NATIVE_DEVICE.
