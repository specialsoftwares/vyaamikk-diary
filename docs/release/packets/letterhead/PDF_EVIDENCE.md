# Letterhead PDF evidence

Date: 2026-10-07 (PR #32 corrections)

## Fixtures

Directory: `docs/release/packets/letterhead/pdf-fixtures/`

| Case | Observation |
|---|---|
| `imported-contain-top.html` | `object-fit: contain` + `object-position: top center` |
| `generated-left/center/right.html` | Header flex matches PDF align classes; long bilingual name/address |
| `generated-mono.html` | `filter: grayscale(1) contrast(3)` on logo |
| `multi-page-body.html` | Long body + `@page` margins for continuation |

Open HTML in a desktop browser at print preview (A4) for visual check.

## Not claimed

- Android Print / expo-print device raster
- Pixel-perfect match to physical letterhead stock
- Gallery photo appearance transforms (incomplete; see continuity packet)
