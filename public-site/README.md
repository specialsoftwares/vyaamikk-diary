# Vyaamikk Diary — Public Static Site

Standalone marketing and legal website for **https://vyaamikkdiary.in**.

This folder is **independent of the Expo app bundle**. It contains plain HTML/CSS only — no framework, no build step, no backend.

## Relationship to the Expo app

| Surface | Purpose |
|---------|---------|
| **`public-site/`** (this folder) | Hosted public website for SEO, legal compliance, Play/App Store URLs, and marketing |
| **Expo route `/landing`** (`app/(public)/landing.tsx`) | In-app / Expo web route inside the React Native bundle — not a substitute for this site |

Keep legal URLs in the app env (`EXPO_PUBLIC_PRIVACY_URL`, etc.) pointed at this hosted site once deployed.

## Screenshot assets

App screenshots are converted from `assets/*.HEIC` (originals untouched) into web formats:

```bash
npm run prepare:public-screenshots
```

**Requirements:** macOS `sips` (built-in) for HEIC decode/resize; `npx sharp-cli` for WebP (downloaded on first run).

**Output:** `public-site/assets/screenshots/` — WebP + PNG at 430px and 860px (@2x), plus `screenshots.manifest.json` and **`public-site/screenshots-data.js`** (embedded manifest for `file://` and static hosts without CORS issues).

Only entries with `"safeForPublic": true` render on the landing page. Dashboard screenshots are converted but excluded until demo profile data is redacted or approved.

Open `index.html` directly in a browser — screenshots load from `screenshots-data.js` without needing `python3 -m http.server`.

## Files

```
public-site/
  index.html
  privacy.html
  terms.html
  delete-account.html
  styles.css
  screenshots.js
  screenshots-data.js        ← auto-generated manifest (load before screenshots.js)
  assets/logo-mark.svg
  assets/screenshots/          ← generated WebP/PNG + manifest
  README.md
```

## Intended URLs (after deploy)

| Page | URL |
|------|-----|
| Home | https://vyaamikkdiary.in/ |
| Privacy | https://vyaamikkdiary.in/privacy.html |
| Terms | https://vyaamikkdiary.in/terms.html |
| Delete account | https://vyaamikkdiary.in/delete-account.html |
| App download (placeholder) | https://vyaamikkdiary.in/download |

Map clean paths (`/privacy`, `/terms`) via host redirects if desired — see hosting sections below.

## Placeholders to replace before store submission

| Placeholder | Where |
|-------------|--------|
| `TODO_GRIEVANCE_OFFICER_NAME` | privacy.html, delete-account.html, index footer |
| `TODO_REGISTERED_ADDRESS` | privacy.html, delete-account.html, index footer |
| `https://vyaamikkdiary.in/download` | index.html CTA — replace with Play Store / App Store links when live |
| Effective date `2026-07-01` | privacy.html, terms.html — confirm with counsel |

Confirmed values already used:

- Support: **support@specialsoftwares.in**
- Grievance email: **grievance@specialsoftwares.in**
- Operator: **Ananya Engineered Industrial Components & Pay Systems LLP**
- Brand: **SPECIAL SOFTWARES**
- Alternate product site: **https://vyaamikk.specialsoftwares.in**

## Local preview

Any static file server works:

```bash
cd public-site
python3 -m http.server 8080
# open http://localhost:8080
```

Or:

```bash
npx serve public-site
```

## Hosting — Firebase Hosting

1. Install Firebase CLI: `npm i -g firebase-tools`
2. From repo root (or a deploy-only folder), create or extend `firebase.json`:

```json
{
  "hosting": {
    "public": "public-site",
    "ignore": ["README.md"],
    "headers": [
      {
        "source": "**",
        "headers": [
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
        ]
      }
    ],
    "rewrites": [
      { "source": "/privacy", "destination": "/privacy.html" },
      { "source": "/terms", "destination": "/terms.html" },
      { "source": "/delete-account", "destination": "/delete-account.html" }
    ]
  }
}
```

3. `firebase login`
4. `firebase init hosting` (select existing project, set public directory to `public-site`)
5. `firebase deploy --only hosting`
6. Connect custom domain **vyaamikkdiary.in** in Firebase Console → Hosting → Add custom domain

## Hosting — Netlify

1. Push repo to GitHub/GitLab
2. Netlify → Add new site → Import repository
3. **Publish directory:** `public-site`
4. **Build command:** *(leave empty)*
5. Domain: add **vyaamikkdiary.in** under Domain settings
6. Optional `_redirects` file inside `public-site/`:

```
/privacy          /privacy.html          200
/terms            /terms.html            200
/delete-account   /delete-account.html   200
/download         /index.html#get-app    200
```

## Hosting — Vercel

1. Import repository in Vercel
2. **Root Directory:** `public-site`
3. **Framework Preset:** Other (static)
4. **Build Command:** *(empty)*
5. **Output Directory:** `.` (or leave default if root is `public-site`)
6. Add domain **vyaamikkdiary.in**
7. Optional `vercel.json` in `public-site/`:

```json
{
  "rewrites": [
    { "source": "/privacy", "destination": "/privacy.html" },
    { "source": "/terms", "destination": "/terms.html" },
    { "source": "/delete-account", "destination": "/delete-account.html" }
  ]
}
```

## Hosting — Shared cPanel / generic static hosting

1. Upload all files in `public-site/` to `public_html/` (or subdomain docroot)
2. Ensure `index.html` is the directory index
3. Enable HTTPS (Let's Encrypt via host panel)
4. Point DNS **A/CNAME** for `vyaamikkdiary.in` to your host

## After deploy checklist

- [ ] Update app env: `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_ACCOUNT_DELETION_URL`, `EXPO_PUBLIC_APP_INSTALL_URL`
- [ ] Replace TODO placeholders with counsel-approved text
- [ ] Test all four pages on mobile Safari and Chrome
- [ ] Submit delete-account URL to Google Play / App Store listings
- [ ] Verify canonical URLs and Open Graph with [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)

## No Expo app changes required

Deploying this folder does not modify boot routing, auth, Firestore, save flows, PDFs, records, or `app/(public)/landing.tsx`.
