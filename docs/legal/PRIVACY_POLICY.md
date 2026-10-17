# Privacy Policy — Vyaamikk Diary

**Status: UNPUBLISHED DRAFT.** This file is the ready-to-publish source for the website. It is not the live page. Do not treat it as accepted until `https://vyaamikk.specialsoftwares.com/privacy` is updated and that update is checked.

**Effective date in the app source:** 2026-07-27  
**Document version in the app source:** 1.0.0 (not bumped for this draft)  
**App:** Vyaamikk Diary  
**Brand:** SPECIAL SOFTWARES  
**Operator:** Ananya Engineered Industrial Components & Pay Systems LLP  
**Address:** 841, Plot 35, Sector 6, Dwarka, New Delhi, Delhi - 110075, India  
**Support:** support.vyd@specialsoftwares.com  
**Website configured in the app:** https://vyaamikk.specialsoftwares.com  
**Privacy URL configured in the app:** https://vyaamikk.specialsoftwares.com/privacy  
**Terms URL configured in the app:** https://vyaamikk.specialsoftwares.com/terms  
**Account deletion URL configured in the app:** https://vyaamikk.specialsoftwares.com/delete-account  

**Grievance Officer (India):** Shivam Saurav, Designated Partner, grievance@specialsoftwares.in, at the address above.

## What this app is

Vyaamikk Diary is a business record-keeping and document tool. It is not a bank, lender, GST filing portal, statutory certifier, or professional adviser. Records, totals, insights, and PDFs are the user’s documents.

## Information the app handles

- Phone number used to sign in, and the authentication identifier issued for that sign-in.
- Profile fields you save: name, optional business name, field of work, designation, email, logo, and language.
- Vyaamikk ID (UEID) assigned to the account.
- Records you create: diary entries, professional packs, customer-credit records, purchase orders, parties, amounts, due dates, reminders, attachments, and drafts.
- Optional images you choose for a record or profile. The app does not take those in the background.
- Optional crash reports, only after you turn them on. Those reports can include an installation identifier and device metadata from the crash-reporting SDK. They are not a claim that reporting is anonymous, and they do not include your account id, phone number, email, amounts, or record text by app design.
- Local preferences such as language and the crash-report choice.

The current candidate does not use background location or a map. A PIN you type, or an explicit “Detect my PIN” action where that control is still present, is information you initiate.

## Where it is stored

- The phone keeps the working record in SQLite. That is the durable copy the screens read before a remote list returns.
- Some preferences, including the crash-report choice, are stored in on-device app storage.
- Session material uses the platform secure store where the sign-in flow already does.
- Files you generate, including PDFs and chosen images, stay in app file storage unless you share or print them.
- When the network is available, records can sync to Google Firebase (Firestore and, where a feature uploads a file, Cloud Storage). Pending local changes stay on the phone until that sync is accepted.
- One account’s records are not shown for another account. A sign-out or account change drops the previous account’s on-screen data.
- Party totals and Business Insights figures in this candidate are counted on the device. The server party-ledger projector is not enabled, so those figures are not a hosted ledger.

## How it is used

The information is used to keep your records, produce PDFs you request, schedule reminders you create, sync your account, and, if you opt in, send crash diagnostics. It is not used for advertising or cross-app tracking in this app. The website’s own tracking is not certified by this draft.

Opening the Privacy or Terms link does not change the crash-report choice.

## Processors

Google Firebase / Google Cloud provides authentication, database, and file storage when those features run. SMS for sign-in is delivered through Firebase Authentication. Email verification, when configured, uses the email provider already configured for the product. Optional crash reporting uses Firebase Crashlytics. App binaries are built with Expo. This draft does not add another telemetry provider.

## Retention and deletion

Records stay while the account is active. Deleting the account starts a 45-day cancellation window before app-controlled account data is erased. That window is the existing product rule; this draft does not change it. Delete the account in Settings → Account & Security, or request deletion at the account-deletion URL above. PDFs or files you already shared or printed outside the app cannot be recalled.

## Security

Traffic to the configured cloud services uses encryption in transit. Stored cloud data is subject to the provider’s at-rest controls. This draft does not claim end-to-end encryption, an encrypted SQLite database, hosting only in India, or a separate key-management system for every record.

## Children

The app is for business users aged 18 and above. It is not directed at children.

## Your requests

You may request access, correction, erasure, and grievance redressal under applicable Indian law, including the Digital Personal Data Protection Act, 2023. Write to the Grievance Officer above.

## Changes

Material changes belong on the website with an updated effective date. The in-app consent version stays 1.0.0 until a published document change requires a new acceptance. This draft has not been published, so the consent version is unchanged.
