# Dependency security closeout — 2026-10-07 (round 2)

Dated audits (no credentials / private data):

| Tree | Prior after (`root-audit-after.json`) | Round 2 (`root-audit-after-round2.json`) |
|------|----------------------------------------|------------------------------------------|
| Root | 56 total (0 critical, 33 high, 23 moderate) | **53** total (**0 critical**, **28** high, **25** moderate) |
| Functions | 12 moderate only | unchanged this round |
| Invoice renderer | 5 (4 high, 1 moderate) | **5** (4 high via `extract-zip`/`puppeteer`, 1 moderate); **`basic-ftp` CLEARED** |

Corrections applied to prior report framing:

1. **`--omit=dev` does not establish runtime reachability.**
2. **Parent-package findings are not automatic advisory noise.**
3. **Deprecation warnings ≠ security advisories.**
4. **`fixAvailable:true` is not a compatibility guarantee.** Each residual was inspected for installed version, consuming constraints, and fixed range before override.
5. **Do not group all residuals under “requires Expo/RN major.”** Several highs cleared with same-major overrides (below). Others truly need Metro/RN/Expo majors or have no fixed release.
6. **`basic-ftp` 5.3.1→6.2.2 is a major-version override**, not a patch/minor. Consumer API verified separately from `tsc`.

## Round-2 targeted root overrides (compatible)

| Package | Installed before → after | Fixed range / note | Consumer | Exposure |
|---------|--------------------------|--------------------|----------|----------|
| `browserslist` | 4.28.2 → **4.29.3** | advisory `<=4.28.6` | Expo Metro / Babel targets | Build tooling (query cache / stats) |
| `fast-uri` | 3.1.2 → **3.1.8** | advisory `3.0.0–3.1.7` | `ajv` via `expo-build-properties` | URI parse/serialize in schema tooling |
| `http-cache-semantics` | 4.2.0 → **4.3.0** | advisory `<=4.2.0` | `got` via `@expo/ngrok` | HTTP cache freshness (dev tunnel helper) |
| `js-yaml@4` | 4.3.0 → **4.3.2** | merge-key / omap highs | eslint / `@expo/xcpretty` | YAML parse of config (dev/CI) |
| `js-yaml@3` | 3.14.2 → **3.15.2** | merge-key highs on 3.x | `@istanbuljs/load-nyc-config` | Jest/Babel coverage config |
| `@xmldom/xmldom@0.8` | 0.8.13 → **0.8.15** | `<=0.8.14` | `@expo/plist` | Plist/XML parse in Expo CLI |
| `@xmldom/xmldom@0.9` | 0.9.10 → **0.9.12** | `<=0.9.11` | `plist` via RN Firebase auth | Apple plist parsing |

Verification: `npm ls` shows overridden versions; round-2 audit marks **browserslist / fast-uri / http-cache-semantics / @xmldom/xmldom CLEARED**.

### Remaining after round 2 (individually)

| Package | Why not closed | Classification |
|---------|----------------|----------------|
| `image-size@1.2.1` | Advisory range includes through **2.0.2**; fixed in **2.0.3+** only. Metro `0.83.3` depends on **1.x**. Forcing 2.x is a **major** for that consumer — not applied. `fixAvailable:true` here means “upgrade to 2.x”, not a 1.x patch. | **Remaining high — Metro/image-size major** |
| `js-yaml@3.15.2` | Merge-key highs cleared; residual **moderate** is via **`argparse`** (parent still listed). Clearing needs RN/Jest stack move (`fixAvailable` suggests RN **0.86.3** major) or argparse fix path. | **Remaining moderate — transitive argparse / Jest** |
| Expo / RN / Firebase / Metro / `node-forge` / `postcss` / Jest parents | npm proposes Expo 44 / RN 0.86 / Firebase 9.14 — **SemVer-major or downgrade**; not started. | **Requires separate SDK migration program** |

## Prior critical / high records (still accurate)

### shell-quote / websocket-driver / Functions proxy-addr — FIXED (round 1)

See prior sections in git history; overrides retained: `shell-quote@1.12.0`, `websocket-driver@0.7.5`, Functions `proxy-addr@2.0.8`, `@fastify/busboy@3.2.2`, `@grpc/grpc-js@1.14.5`, `form-data@2@2.5.6`.

### Invoice renderer — `basic-ftp` (major-version override)

| Field | Value |
|-------|-------|
| Resolved | **5.3.1 → 6.2.2** via renderer `overrides` |
| Label | **Major-version override** (not patch/minor) |
| Advisory | GHSA-c475-qrg2-pj4r (ReDoS in Unix `list()` parser) |
| Path | `puppeteer` → `@puppeteer/browsers` → `proxy-agent` → `pac-proxy-agent` → `get-uri` → `basic-ftp` |
| Consuming API | `get-uri/dist/ftp.js` uses `new Client()`, `client.access(...)`, `client.list(...)`, `downloadTo`, `close` |
| Verification | `src/basicFtpOverride.smoke.test.ts` asserts version **6.2.2** + those methods + `parseList` on a short valid line. **Not** network FTP acceptance. `tsc` alone was treated as insufficient. |
| Audit | `basic-ftp` **CLEARED** in `renderer-audit-after-round2.json` |

### Invoice renderer — `extract-zip@2.0.1` (UNRESOLVED)

| Field | Value |
|-------|-------|
| Advisories | GHSA-jmr9-qjv8-65gv / GHSA-7pqw-9j4j-h8q3 |
| Fixed release | **None** on npm (`latest` still 2.0.1). npm “fix” downgrades puppeteer → rejected. |
| Where extraction can run | `@puppeteer/browsers` `fileUtil` dynamically imports `extract-zip` when unpacking a browser archive during Puppeteer browser install. |
| Docker builder (before) | `FROM node:22… AS builder` ran `npm ci` **without** `PUPPETEER_SKIP_DOWNLOAD` → install script could download Chromium and invoke `extract-zip`. |
| Docker runtime | Base `ghcr.io/puppeteer/puppeteer:24.22.3` already has Chromium; `PUPPETEER_SKIP_DOWNLOAD=true` then `npm ci --omit=dev` — download/extract skipped at runtime install. |
| Mitigation applied | (1) Set **`PUPPETEER_SKIP_DOWNLOAD=true` in the Dockerfile builder stage** (builder only needs `tsc`). (2) **`scripts/ci/test-invoice-renderer-build.sh`** now exports and passes **`PUPPETEER_SKIP_DOWNLOAD=true`** into the separate Node 22 `docker run` container **and** the local host `npm ci` fallback, with an explicit assert that the env is `true` before install. The Dockerfile `ENV` does **not** configure that separate CI container — the script must set it. |
| Remaining risk | Package still present in the install tree; **not patched and not removed.** Any future path that downloads a browser archive without skip still hits unfixed `extract-zip`. Trusted network / pinned `puppeteer@24.22.3` reduces supply-chain odds but is **not** archive-integrity proof. **Finding kept open — not silently cleared.** Retained for public-release review; not a material credential/tester-data risk for a restricted Internal AAB build that does not ship this renderer service. |

## Overrides (compatibility justification)

| Tree | Override | Why applied |
|------|----------|-------------|
| Root | round-1 pins + `browserslist@4.29.3`, `fast-uri@3.1.8`, `http-cache-semantics@4.3.0`, `js-yaml@3@3.15.2`, `js-yaml@4@4.3.2`, `@xmldom/xmldom@0.8@0.8.15`, `@xmldom/xmldom@0.9@0.9.12` | Same major (or dual 0.8/0.9 pins); consumers accept these ranges |
| Root | *(not)* `image-size@2.0.4` | Metro locked to 1.x; major consumer break risk |
| Renderer | `basic-ftp@6.2.2` | **Major-version override**; get-uri Client API verified by smoke test |
| Renderer | `undici@6@6.29.0` | Patch within major |

**Not used:** `npm audit fix --force`, Expo downgrade, RN major upgrade, blanket audit suppression, CI weakening.

## Evidence files

- `root-audit.json` / `root-audit-after.json` / **`root-audit-after-round2.json`**
- `root-audit-omit-dev.json` (methodological control only)
- `functions-audit.json` / `functions-audit-after.json`
- `renderer-audit.json` / `renderer-audit-after.json` / **`renderer-audit-after-round2.json`**
- `RUN.txt` (UTC stamp)
