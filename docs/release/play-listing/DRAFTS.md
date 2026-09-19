# Play Console listing drafts (not submitted)

Derived from actual SDK/data flows. Placeholders are marked. Do not paste these into Console as final legal approval.

## 1. App access / sign-in instructions (internal testers)

Package: `com.specialsoftwares.vyaamikkdiary`

1. Install the internal-track APK/AAB for the reviewed versionCode (proposed first internal: **19**, unused at 2026-09-19 inspection; later binaries may need a higher unused code).
2. Sign in with a real Indian mobile number via Phone OTP. Expo Go cannot send production OTP. A Play-installed or EAS native binary is required.
3. Optional: business email OTP after phone sign-in.
4. Complete onboarding identity fields if prompted.
5. Create a diary/PO/Customer Credit/pack record. Letterhead is free and does not consume ordinary monthly quota.
6. Open Settings → Subscription & billing. Purchases stay fail-closed until Play billing Functions and `PLAY_BILLING_ENABLED` are approved and deployed. License testers are required for a real IAP test.

Do not invent tester passwords. Use owner-controlled test accounts already known to the project.

## 2. Target audience

- Primary: small and mid-size Indian business owners keeping operational records (diary, cash, credit, packs, letterhead).
- Age: 18+. Not directed at children.
- Language: English and Hindi in-app; other locales fall back to English.

## 3. Data safety (from actual flows)

Collected / processed in-app or by backends this app uses:

- **Account identifiers:** Firebase Auth UID, phone number, optional business email, Vyaamikk ID (UEID)
- **User content:** business records, attachments, letterhead images, optional customer photos, PDFs
- **Location (optional):** when-in-use footprints on records the user saves; not background tracking
- **Device / app integrity (future):** App Check Play Integrity tokens when a native binary initializes App Check (unenforced today)
- **Purchases (when billing is enabled):** Play purchase tokens sent to Vyaamikk Functions only; not logged; not written by the client to Firestore
- **Diagnostics:** privacy-minimized billing diagnostic HMAC; crash/startup diagnostics without secrets

Not claimed here: advertising ID as a product feature, background location, selling personal data.

Approximate Console mappings (reviewer must still complete the form):

- Personal info: name, email (optional), phone
- Financial: purchase history (Play), billing details GSTIN if the user supplies it
- Location: approximate/precise optional
- Files and docs: user-created PDFs and attachments
- Device IDs: App Check / Firebase installation as required by those SDKs

## 4. Category and contact

- Category: Business
- Support email: from `env.brand.supportEmail` (must not be example.com in production)
- Website: `env.brand.websiteUrl`
- Contact / grievance: see owner fact request — officer name and registered address are still placeholders

## 5. Store listing (short/full)

**Short:** Business records, letterhead and reminders for Indian owners — diary, cash and credit in one place.

**Full:** Vyaamikk Diary by SPECIAL SOFTWARES helps Indian business owners keep diary, purchase-order, customer-credit and pack records on their phone, with free letterhead for 12 months from signup under the current policy (no automatic charge). Optional location footprints stay on records you save. Paid plans, when offered, are sold through Google Play; manage or cancel in Google Play. This app is not a GST filing or tax-advice service.

Graphics, screenshots and video: not produced in this source task.
