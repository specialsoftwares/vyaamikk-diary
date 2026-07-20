# DRAFT PRIVACY POLICY — FOR OWNER & COUNSEL REVIEW ONLY

**Status:** PROVISIONAL · Evidence-led from Phase A · **Not for publication**  
**Product:** Vyaamikk Diary  
**Operator (as coded):** Ananya Engineered Industrial Components & Pay Systems LLP (SPECIAL SOFTWARES brand)  
**Application ID:** `com.specialsoftwares.vyaamikkdiary`  
**Draft basis tip:** `f1019b6`  

> **Publication blocker:** Any paragraph containing `[OWNER CONFIRMATION REQUIRED: …]` or `[EXTERNAL VERIFICATION REQUIRED: …]` must be resolved or removed with accurate facts before hosting. See clean-publication checklist at the end.

---

## 1. Who we are

Vyaamikk Diary (“**App**”, “**we**”, “**us**”) is a business record-keeping application operated by:

**[OWNER CONFIRMATION REQUIRED: exact registered legal name]**  
Ananya Engineered Industrial Components & Pay Systems LLP (string currently used in the App).  

**Brand:** SPECIAL SOFTWARES  

**Registered office:** [OWNER CONFIRMATION REQUIRED: registered office]  

**Support:** support.vyd@specialsoftwares.com  
**Website:** https://vyaamikk.specialsoftwares.com  

**Grievance Officer (India):** [OWNER CONFIRMATION REQUIRED: Grievance Officer name]  
**Grievance email:** [OWNER CONFIRMATION REQUIRED: grievance email]  
**Grievance address:** [OWNER CONFIRMATION REQUIRED: grievance postal address]  

**Effective date:** [OWNER CONFIRMATION REQUIRED: policy effective date]  
**Version:** [OWNER CONFIRMATION REQUIRED: version string]

---

## 2. Scope

This Privacy Policy describes how we **collect**, **process**, **retain**, and **delete** personal data and business information when you use:

- the Vyaamikk Diary mobile application; and  
- related account, sync, and support features.

It also explains links to our website. **Website cookies and analytics are described in our Cookie Policy only to the extent verified.** Facts about the live website that are not verified in our mobile repository are marked accordingly.

This Policy is **not** a warranty of legal compliance.

---

## 3. Definitions we use (aligned with our technical disclosures)

| Term | Meaning |
|------|---------|
| **Collect** | We obtain data from you, generate it in the App, or receive it from an identity/infrastructure provider as part of providing the service |
| **Process** | Any operation on data, including storage and transmission, including by service providers acting for us |
| **Share** | Disclose to a third party other than a service provider processing on our instructions (advertising sale is not practiced in the current App) |
| **User-initiated sharing** | You export or send content via the operating system share sheet, email, messaging apps, print, or similar |
| **Retain** | Keep after creation, including during a deletion grace period or for security indexes |
| **Delete** | Erase or irreversibly de-identify App-controlled copies we can control |
| **Optional** | You can deny or skip and still use core App functions (with feature limits) |
| **Required** | Needed to create or maintain an account or complete a specific feature |

---

## 4. Data we collect

### 4.1 Account and authentication (Required for an account)

- Mobile number (E.164) for OTP sign-in  
- Authentication identifiers (including Firebase Authentication user ID)  
- Vyaamikk ID (UEID)  
- Session information stored securely on your device  
- Login and activity timestamps used for account security and product features  

**OTP codes** are generated and delivered through our authentication provider; the App is designed not to log OTPs.

### 4.2 Profile information

- **Required to unlock the main App:** display name  
- **Optional:** salutation, business/shop name, field of work, designation, business email (verification may be required for certain recovery/reactivation flows), language preference, profile/logo image, PDF branding preferences  
- Affirmative **Terms / Privacy consent** records (version, timestamps)

### 4.3 Business records you create

Depending on features you use, this may include diary/business entries, staff notes, cash records, material dispatch/receipt/return details, freight details, payment requests, reminders, purchase orders, customer credit/Dukaan records, letterhead content, professional pack content, drafts, edit history, amounts, party names, free-text notes, and similar business fields you enter.

**You decide what business content to enter.** Do not enter information you are not entitled to process.

### 4.4 Location (Optional)

- Foreground GPS footprints (latitude, longitude, accuracy, time) only if you enable Location Access and grant system permission while the App is open  
- Indian PIN codes and related locality text you enter; PIN lookup may use on-device postal data and, if needed, a public PIN web API  

**We do not use background location in the current App configuration.**

### 4.5 Photos and files (Optional)

- Images you choose from camera or photo library for letterhead, receipt/customer photos, or similar attachments  
- Files may be stored on device and, when cloud features are enabled, uploaded to Firebase Storage under your user path  

### 4.6 Notifications (Optional)

- Local reminder notifications you schedule (title/body/time)  
- The current App uses **local** reminders and does **not** implement remote push-token collection in application code  

### 4.7 Device and technical information

- App preferences (for example language and appearance) stored on device  
- On-device database, sync queue, and caches needed for offline use  
- Network requests to our service providers necessarily expose IP address and standard technical metadata to those providers  

**[EXTERNAL VERIFICATION REQUIRED: Firebase / Google diagnostic identifiers and any Console-level Google Analytics]**  
We have not implemented a separate third-party crash or marketing analytics SDK in the current application code reviewed for this draft.

### 4.8 Support communications

If you email support or use website contact channels, we process the content of your messages and any identifiers you provide to respond.

---

## 5. How we use data (purposes)

We process data to:

1. Create and secure accounts (OTP authentication, session restore)  
2. Provide business record-keeping, PDF generation, and optional cloud sync  
3. Show Calendar & Maps features when you enable location-related features  
4. Schedule local reminders you create  
5. Improve reliability of sync and prevent abuse (including limited retired-phone indexes after deletion)  
6. Meet legal obligations and respond to grievance/support requests  
7. Maintain affirmative consent records  

We do **not** use your business records for third-party advertising in the current App build reviewed for this draft.

**Candidate lawful bases under Indian law (NON-FINAL — counsel to finalise):** consent; performance of contract; legitimate uses permitted by applicable law for security and fraud prevention.

---

## 6. Service providers (processors / infrastructure)

We use service providers to operate the App. This is **processing**, not a sale of your data.

| Provider / service | Role (factual) |
|--------------------|----------------|
| Google Firebase / Google Cloud | Authentication, Firestore database, Storage, Cloud Functions (when configured) |
| SMS delivery via Firebase Authentication | OTP delivery in production configurations |
| Expo / EAS | Application build and update tooling |
| Public PIN lookup API (when offline data insufficient) | Resolve PIN locality text |
| Map platform components | Display maps (tile providers may receive technical requests) |
| Email delivery provider for verification | [EXTERNAL VERIFICATION REQUIRED: email provider name] |
| Website host (Lovable / DNS) | [EXTERNAL VERIFICATION REQUIRED: hosting & analytics stack] |

**[EXTERNAL VERIFICATION REQUIRED: Firebase processing location / international transfers]**  
Cloud Functions source in this repository targets region `asia-south1`, but this does **not** by itself prove that all processing or subprocessors remain in India.

---

## 7. Disclosures

We may disclose data:

- To service providers under the above arrangements  
- When you use **user-initiated sharing** (PDFs, share sheet, print) — recipients are outside our control  
- If required by law, regulation, or lawful authority  
- In connection with a corporate reorganisation, subject to appropriate safeguards  

We do **not** sell personal data.

---

## 8. Security

We implement technical measures appropriate to the App, including authenticated cloud access controls, on-device secure session storage, and transport to our backends over HTTPS.

**We do not claim** encryption-at-rest guarantees, certifications, or that security is absolute.  
**[EXTERNAL VERIFICATION REQUIRED: encryption at rest / certifications]**

---

## 9. Retention

| Class | Behaviour (as implemented / intended) |
|-------|----------------------------------------|
| Active account data | Retained while your account remains active |
| Account deletion | Enters a **15-day grace period**, then final erasure steps for App-controlled cloud records |
| Security indexes | Limited records such as retired phone bindings may be retained to prevent abuse |
| Device data | May remain on your device until you clear App storage or uninstall |
| Exported PDFs | Outside our control once shared |

**[OWNER CONFIRMATION REQUIRED: retention periods for support tickets, logs, and retiredPhones]**  
Where no fixed period is implemented, we retain only as long as needed for the purposes above or as required by law.

---

## 10. Account deletion

You may delete your account and associated App-controlled data:

- **In the App:** Settings → Delete Account & Data (also reachable from Settings → About → Delete account)  
- **On the web:** https://vyaamikk.specialsoftwares.com/delete-account  

Deletion starts a **15-day grace period**. After the grace period, we run final deletion steps for App-controlled cloud database records associated with your account.

**Important limitations (must stay accurate):**

- Exported or shared PDFs cannot be recalled  
- Data on your device may remain until you clear storage/uninstall  
- Limited anti-abuse records (for example retired phone indexes) may be retained  
- **[EXTERNAL VERIFICATION REQUIRED: Firebase Storage bucket soft-delete / versioning / backup recovery window]**  
  Application-level deletion removes active objects under `users/{uid}/letterhead|attachments|pdfs/`. Provider recovery windows may still exist.  
- Reactivation during grace (where offered) requires **in-App identity verification** (for example a verification code to your registered business email). **An email reply alone does not reactivate an account.**

See also our Account Deletion disclosure.

---

## 11. Your choices and rights

Depending on applicable law (including the Digital Personal Data Protection Act, 2023, as and when relevant obligations apply to us), you may have rights to access, correction, erasure, and grievance redressal.

**Technically available today:**

- Edit certain profile fields in Settings  
- Withdraw optional permissions in system Settings (location, photos, notifications)  
- Delete individual records you created  
- Request account deletion as above  
- Contact support / grievance channels  

**May require manual operations:** structured data export packages; web-only deletion intake verification.

---

## 12. Children

The App is intended for business users aged **18 years and above**. We do not knowingly collect personal data from children.

**[OWNER CONFIRMATION REQUIRED: whether an age gate will be implemented]**  
The current App does not collect date of birth as an age gate.

---

## 13. International processing

Your data may be processed by infrastructure providers that operate in multiple countries.  
**[EXTERNAL VERIFICATION REQUIRED: Firebase processing location]**  
We will update this section when transfer mechanisms required under applicable Indian law are confirmed by counsel.

---

## 14. Website

Our website is available at https://vyaamikk.specialsoftwares.com. Website storage technologies are described in the Cookie Policy based on a separate website audit. Until that audit is complete, we do not assert specific cookie or analytics practices as facts in this Policy beyond the existence of the public site and linked legal pages.

---

## 15. Changes

We may update this Policy. Material changes will be posted on our website with an updated effective date. Where required, we may ask for renewed consent in the App.

---

## 16. Contact

- Support: support.vyd@specialsoftwares.com  
- Grievance: [OWNER CONFIRMATION REQUIRED: grievance email]  
- Postal: [OWNER CONFIRMATION REQUIRED: registered office]

---

## Clean-publication readiness checklist

- [ ] All `[OWNER CONFIRMATION REQUIRED]` resolved  
- [ ] All `[EXTERNAL VERIFICATION REQUIRED]` resolved or removed with accurate wording  
- [ ] Support/grievance/website domains consistent (`.com`)  
- [ ] 15-day grace + Storage/Auth deletion facts match engineering  
- [ ] Counsel sign-off  
- [ ] Live hosting at `/privacy`  
- [ ] In-app `documents.ts` / web HTML synced  
- [ ] Play Data Safety answers match this Policy  
