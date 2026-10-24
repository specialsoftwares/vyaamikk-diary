import {
  DELETION_GRACE_DAYS,
  DELETION_V2_ERASURE_DAYS,
  DELETION_V2_PROCESSING_ALLOWANCE_DAYS,
  DELETION_V2_REACTIVATION_DAYS,
} from "@/domain/identityLifecycle";

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
      "Eligibility: a self-declared date of birth used only to decide whether the account is 18 or older. The date is not stored after the server records the result, the policy version, and the time. This is not an identity-document check and it is not independently verified. Aadhaar is not collected.",
      "Business records: diary entries, purchase orders, customer credit/Dukaan records, letterhead matters, professional packs, drafts, and derived insights.",
      "Location: optional foreground GPS footprints when you enable Location Access; Indian PIN codes you enter; no background location in the current app.",
      "Photos: images you choose for cash-paid attachments or customer photos, and letterhead images already saved in earlier versions.",
      "PDFs: generated on your device; file bytes are not automatically uploaded in the current version.",
      "Device/session: secure session storage, language preference, sync queue, reminder notification IDs.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: [
      "We use data only to provide the service, secure accounts, schedule local reminders you create, sync cloud data when enabled, and comply with law.",
      "Running the account, storing the records you create, and securing sign-in are required to provide the service. They are not optional consent choices. Crash diagnostics are optional. Turning them off stops that processing and does not delete the account.",
      "Business record text and original attachment bytes written by the current production app are stored as ciphertext. Firebase Auth identifiers and operational routing fields stay readable. The signed-in owner can open that ciphertext through the server after the existing session checks. This is not end-to-end encryption, and it is not a claim that the operator is technically incapable of decrypting.",
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
      `Active data is retained while your account is active. Requests already pending keep their original ${DELETION_GRACE_DAYS}-day cancellation window before final erasure of app-controlled account data. This window is not a freeze-only hold.`,
      `New deletion requests are completed for eligible app-controlled data within ${DELETION_V2_ERASURE_DAYS} days of the server-accepted request. You can reactivate for ${DELETION_V2_REACTIVATION_DAYS} days. The remaining ${DELETION_V2_PROCESSING_ALLOWANCE_DAYS} days are reserved for processing and retries.`,
      "Delete your account in Settings → Delete Account & Data, or request deletion at our web page.",
      "Exported or shared PDFs outside the app cannot be withdrawn or deleted by us.",
      "These periods do not make every provider backup, legally retained billing record, or PDF you already exported disappear. Firebase Authentication backups can remain for up to about 180 days. Crash diagnostics, where you allowed them, follow the provider’s own retention. Billing and tax records stay for their own legal period. A restored backup is suppressed for an account whose erasure job has completed, but that suppression is not a promise that a provider backup never existed.",
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
      "You are solely responsible for the accuracy, legality, and use of records, PDFs, purchase orders, credit notes, and letterhead content saved in your account.",
      "You retain ownership of your content and grant us a limited license to host and process it solely to provide the service.",
    ],
  },
  {
    title: "Feature-specific terms",
    paragraphs: [
      "PDFs and purchase orders are user-generated documents. Dukaan/customer credit is record-keeping only, not lending.",
      "Business insights, party totals counted on this device, and statutory prompts are not a certified ledger, profit statement, or tax report, and they are not professional advice. Check statutory dates on the official portal or with your adviser.",
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
