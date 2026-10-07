# Letterhead PDF evidence (source / injected)

Date: 2026-10-07

## What was checked

| Check | Method | Result |
|---|---|---|
| Imported page uses `object-fit: contain` | `letterheadPdfService.test.ts` source contract | Pass |
| Generated layouts use HTML header (text not fully rasterized) | same + `buildGeneratedHeaderHtml` | Pass |
| `@page` margins drive writing area (multi-page) | existing source contract | Pass |
| Fixed template layer for continuation pages | existing source contract | Pass |
| No platform branding in letterhead PDF | existing source contract | Pass |
| Visual A4 page render (Chromium / device print) | **Not run** — needs matching native/CI Chromium job or device export | Pending device/build |

## Representative HTML expectations (post-fix)

- Imported: `<img class="letterhead-bg" … object-fit: contain>`
- Generated: `<div class="generated-header align-{left\|center\|right}">` + optional logo `<img class="generated-logo">` + text lines
- Body content in `.content` inside `@page` margins derived from `%` writing area

Device visual inspection of exported pages (pale watermark, long Indian-script address, transparent logo, multi-page) remains a **next-build** item.
