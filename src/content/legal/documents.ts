export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    title: "Plain-language summary",
    paragraphs: [
      "Vyaamikk Diary helps Indian businesses and professionals keep structured business records, generate PDFs, and optionally sync data to the cloud when enabled.",
      "We collect your mobile number to secure your account and store the business information you enter. Optional features (email, location footprints, photos, reminders) work only when you choose them.",
      "We use Google Firebase for authentication and cloud hosting when configured. We do not sell your personal data. PDFs you export or share outside the app cannot be recalled by us.",
    ],
  },
  {
    title: "Information we collect",
    paragraphs: [
      "Account: mobile number, authentication identifiers, Vyaamikk ID (UEID).",
      "Profile: name (required for account), optional business name, field of work, designation, email, logo, language.",
      "Business records: diary entries, purchase orders, customer credit/Dukaan records, letterhead matters, professional packs, drafts, and derived insights.",
      "Location: optional foreground GPS footprints when you enable Location Access; Indian PIN codes you enter; no background location in the current app.",
      "Photos: images you choose for letterhead, cash-paid attachments, or customer photos (where enabled).",
      "PDFs: generated on your device; file bytes are not automatically uploaded in the current version.",
      "Device/session: secure session storage, language preference, sync queue, reminder notification IDs.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: [
      "We use data only to provide the service, secure accounts, schedule local reminders you create, sync cloud data when enabled, and comply with law.",
      "We do not use your data for advertising or cross-app tracking in the current app build.",
    ],
  },
  {
    title: "Third-party processors",
    paragraphs: [
      "Google Firebase / Google Cloud (authentication, Firestore, Cloud Functions when deployed).",
      "SMS delivery via Firebase Auth in production.",
      "Public PIN lookup services when offline postal data is insufficient.",
      "Expo/EAS for app builds. Email delivery provider when configured for email verification.",
    ],
  },
  {
    title: "Retention & deletion",
    paragraphs: [
      "Active data is retained while your account is active. Account deletion starts a 15-day grace period before final erasure steps.",
      "Delete your account in Settings → Delete Account & Data, or request deletion at our web page.",
      "Exported or shared PDFs outside the app cannot be withdrawn or deleted by us.",
    ],
  },
  {
    title: "Your rights (India)",
    paragraphs: [
      "You may request access, correction, erasure, and grievance redressal under applicable law including the Digital Personal Data Protection Act, 2023.",
      "Contact our Grievance Officer using the details in the app Settings or on our website.",
    ],
  },
  {
    title: "Children",
    paragraphs: [
      "The app is intended for business users aged 18 and above. We do not knowingly collect data from children.",
    ],
  },
  {
    title: "Changes",
    paragraphs: [
      "We may update this policy. Material changes will be posted on our website with an updated effective date.",
    ],
  },
];

export const TERMS_OF_USE_SECTIONS: LegalSection[] = [
  {
    title: "Acceptance",
    paragraphs: [
      "By using Vyaamikk Diary you agree to these Terms of Use and our Privacy Policy.",
    ],
  },
  {
    title: "The service",
    paragraphs: [
      "Vyaamikk Diary is a business record-keeping and document preparation tool for shops, MSMEs, and professionals.",
      "We are not a bank, NBFC, lender, GST filing portal, statutory certifier, or professional advisor. We do not perform Aadhaar or KYC verification.",
    ],
  },
  {
    title: "Your responsibilities",
    paragraphs: [
      "You are solely responsible for the accuracy, legality, and use of records, PDFs, purchase orders, credit notes, and letterhead content you create.",
      "You retain ownership of your content and grant us a limited license to host and process it solely to provide the service.",
    ],
  },
  {
    title: "Feature-specific terms",
    paragraphs: [
      "PDFs and purchase orders are user-generated documents. Dukaan/customer credit is record-keeping only, not lending.",
      "Business insights and statutory prompts are informational only, not professional advice.",
    ],
  },
  {
    title: "Prohibited use",
    paragraphs: [
      "Do not use the app for fraud, harassment, unlawful recovery, impersonation, or misrepresentation of credentials.",
      "Do not reverse engineer, scrape, or abuse OTP or security systems.",
    ],
  },
  {
    title: "Deletion & availability",
    paragraphs: [
      "The app supports offline-first operation. Cloud sync depends on network and configuration.",
      "Deletion removes app-controlled data subject to grace periods and technical limits. Exported PDFs outside the app are not recalled.",
    ],
  },
  {
    title: "Disclaimers & liability",
    paragraphs: [
      "The app is provided “as is”. To the maximum extent permitted by law, we disclaim warranties and limit liability as set out in the full hosted Terms.",
    ],
  },
  {
    title: "Governing law",
    paragraphs: [
      "These Terms are governed by the laws of India. Disputes are subject to courts in Delhi NCR unless mandatory consumer law provides otherwise.",
    ],
  },
];
