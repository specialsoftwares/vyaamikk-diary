# Dependency security closeout — 2026-10-07T0639Z

Dated audits (no credentials / private data):

| Tree | Before | After targeted overrides |
|------|--------|--------------------------|
| Root (`package-lock.json`) | 63 total (2 critical, 38 high, 23 moderate) | 56 total (**0 critical**, 33 high, 23 moderate) |
| Root `--omit=dev` | 61 (2 critical, 37 high) | *omit=dev is not runtime reachability* — same production-dep tree still lists install-tree findings |
| Functions | 16 (1 critical, 3 high, 12 moderate) | **12 moderate only** (0 critical / 0 high) |
| Invoice renderer | 9 (8 high, 1 moderate) | 5 (4 high, 1 moderate) |

Corrections applied to prior report framing:

1. **`--omit=dev` does not establish runtime reachability.** It only excludes packages marked `devDependencies`. Production-marked packages such as `react-native`, `firebase`, and Expo tooling still pull Metro / CLI / debugger helpers into the install tree.
2. **Parent-package findings are not automatic advisory noise.** A parent listed as `high` because a child is vulnerable is still a real lockfile finding; assess the child’s operation and whether untrusted input reaches it.
3. **Deprecation warnings ≠ security advisories.** `uuid` / `jsrsasign` deprecations seen during install are separate from GHSA rows.
4. **Upgrade/downgrade claims verified against installed versions.** npm’s “fixAvailable: expo@44 / react-native@0.86 / firebase@9.14 / puppeteer@19.8.0” suggestions are SemVer-major (or outright downgrades) and were **not** applied.

## Critical / high records (explicit)

### shell-quote (root) — FIXED

| Field | Value |
|-------|-------|
| Resolved before → after | **1.8.4 → 1.12.0** (override) |
| Advisories | GHSA-395f-4hp3-45gv (DoS in `parse`, ≤1.8.4); GHSA-pqg4-j6r4-53mv / CVE-2026-102422 (`quote()` injection, ≥1.8.4 <1.11.0) |
| Fixed range | ≥1.11.0 (installed 1.12.0) |
| Path | `react-native` → `react-devtools-core` → `shell-quote` |
| Vulnerable operation | `parse()` / `quote()` on attacker-influenced tokens |
| Attacker-controlled input | Untrusted strings passed into shell quoting (typical in CLI / debugger helper paths) |
| Exposure | **Build / Metro / RN tooling**, not an app UI API. Still material on developer/CI hosts that process untrusted paths. Not evidence of mobile RCE by itself. |
| Fix justification | Patch-only override; API-compatible for consumers expecting `^1.6.1`. |

### websocket-driver (root) — FIXED; Functions already patched

| Field | Value |
|-------|-------|
| Resolved before → after | Root **0.7.4 → 0.7.5**; Functions already **0.7.5** |
| Advisories | GHSA-mp7j-qc5w-4988; GHSA-xv26-6w52-cph6 (fixed ≥0.7.5) |
| Path | `firebase` / `@react-native-firebase/app` → `@firebase/database` → `faye-websocket` → `websocket-driver` |
| Vulnerable operation | WebSocket frame compression / length-header handling in the **Node** `websocket-driver` implementation |
| Attacker-controlled input | Malicious WebSocket peer (Realtime Database wire protocol) |
| Exposure | **Install-tree only for the mobile app**: no `getDatabase` / RTDB usage under `src/`. Do **not** equate presence with mobile runtime use of Node RTDB websockets. Functions Admin SDK path retains the package for Admin RTDB capability; version already ≥0.7.5 after override pin. |

### proxy-addr (Functions) — FIXED

| Field | Value |
|-------|-------|
| Resolved before → after | **2.0.7 → 2.0.8** |
| Advisory | GHSA-jqcg-44mw-7w3h (IP spoofing via IPv4-mapped IPv6 trust subnet), CVSS 9.1 |
| Fixed range | ≥2.0.8 |
| Path | `firebase-functions` → `express` → `proxy-addr` |
| Vulnerable operation | Client IP resolution when trust-proxy / subnet checks are used |
| Attacker-controlled input | `X-Forwarded-For` / related forwarded headers |
| Exposure | **Functions HTTP runtime** (Express via firebase-functions). Cloud Functions sits behind Google’s front-end; spoofing impact depends on trust-proxy configuration. Patched regardless. |

### Functions highs — FIXED

| Package | Before → after | GHSA / notes | Path |
|---------|----------------|--------------|------|
| `@fastify/busboy` | 3.2.0 → **3.2.2** | GHSA-xjh9-v7x6-24jw, GHSA-x8mw-p69m-v3mx, GHSA-gxm5-99cw-xjw9 | `firebase-admin` multipart |
| `@grpc/grpc-js` | 1.14.4 → **1.14.5** | GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4 | `google-gax` / Firestore Admin |
| `form-data@2` | 2.5.5 → **2.5.6** | GHSA-hmw2-7cc7-3qxx | optional `@google-cloud/storage` types path |

Verification: `functions` `npm audit` → **0 critical / 0 high**; `npm run build` PASS.

### Invoice renderer highs

| Package | Status | Notes |
|---------|--------|-------|
| `basic-ftp` | **FIXED** 5.3.1 → **6.2.2** (override) | GHSA-c475-qrg2-pj4r via `proxy-agent` → Chromium download stack |
| `extract-zip@2.0.1` | **UNRESOLVED** | GHSA-jmr9-qjv8-65gv / GHSA-7pqw-9j4j-h8q3 — **no fixed release** on npm (`latest` still 2.0.1). npm’s “fix” downgrades puppeteer to 19.8.0 (rejected). |
| Parent `puppeteer` / `@puppeteer/browsers` | Remains high only via `extract-zip` | Build/image bake tooling |

**extract-zip exposure:** used when Puppeteer unpacks browser archives during image/CI setup. Attacker-controlled input requires a malicious archive (supply-chain or MITM of Chromium download). Mitigations in place: pinned `puppeteer@24.22.3`, Docker/CI trusted network, no application acceptance of untrusted zips. **Remaining high — treated as release-visible risk, not silently cleared.** Safe elimination needs upstream `extract-zip` patch or Puppeteer packaging change (not an Expo SDK migration).

### Root remaining highs (not force-fixed)

Cluster around Expo SDK 54 / RN 0.81 / Firebase 12 / Metro / Jest / `node-forge` / `postcss` / `@xmldom/xmldom` / `braces` / `fast-uri`. npm proposes Expo 44, RN 0.86, or Firebase 9.14 — **incompatible major moves; not started**. Additional patch overrides applied where compatible: `compression@1.8.2`, `source-map-js@1.2.2`, `nanoid@3@3.3.20`, `undici@6@6.29.0`, `brace-expansion` majors 1/2/5.

## Overrides (compatibility justification)

| Tree | Override | Why safe |
|------|----------|----------|
| Root | `shell-quote@1.12.0` | Semver-minor within consumers’ `^1.6.1` |
| Root | `websocket-driver@0.7.5` | Patch within `>=0.5.1` |
| Root | `compression`, `source-map-js`, `nanoid@3`, `undici@6`, `brace-expansion@1/2/5` | Patch/minor within major lines already present |
| Functions | `proxy-addr@2.0.8`, `@fastify/busboy@3.2.2`, `@grpc/grpc-js@1.14.5`, `form-data@2@2.5.6`, pins above | Patch within existing majors; Functions build verified |
| Renderer | `basic-ftp@6.2.2`, `undici@6@6.29.0` | Patch/minor; renderer `tsc` build verified |

**Not used:** `npm audit fix --force`, Expo downgrade, RN major upgrade, blanket audit suppression, CI weakening.

## Evidence files

- `root-audit.json` / `root-audit-after.json`
- `root-audit-omit-dev.json` (methodological control only)
- `functions-audit.json` / `functions-audit-after.json`
- `renderer-audit.json` / `renderer-audit-after.json`
- `RUN.txt` (UTC stamp)
