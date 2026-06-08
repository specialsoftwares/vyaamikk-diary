export const LANDING_NAV = {
  platform: "Platform",
  security: "Security",
  workflows: "Workflows",
  compliance: "Compliance",
  contact: "Contact",
  startSecurely: "Start Securely",
  viewLegal: "View Legal",
} as const;

export const LANDING_HERO = {
  headline: "Business records, proofs and documents — secured in one disciplined workspace.",
  subheadline:
    "Vyaamikk Diary helps Indian MSMEs, shop owners and professionals record transactions, generate official PDFs, track customer credit, preserve operational history and keep business memory searchable.",
  primaryCta: "Start with mobile login",
  secondaryCta: "Review privacy & terms",
  trustLine:
    "Built for daily business records, customer credit, purchase orders, material movement, professional briefs and secure document generation.",
} as const;

export const LANDING_TRUST = [
  {
    title: "Secure by Architecture",
    body: "User-scoped records, local-first design patterns, guarded identity flows and controlled cloud sync.",
  },
  {
    title: "Privacy-Aware by Design",
    body: "Data minimisation, explicit consent, deletion pathways and clear separation between UI language and business data.",
  },
  {
    title: "DPDP & IT Act Ready",
    body: "Designed to support Indian privacy expectations, grievance contact pathways and transparent processing notices.",
  },
  {
    title: "Operational Record Integrity",
    body: "Save idempotency, stable record IDs, edit history and controlled PDF generation reduce accidental duplication.",
  },
  {
    title: "Cloud Isolation Principles",
    body: "Each user's records, master data and insights remain scoped to that user.",
  },
] as const;

export const LANDING_VALUE_TABS = {
  owners: "For Business Owners",
  professional: "For Professional Workflows",
} as const;

export const LANDING_VALUE_OWNERS = [
  {
    title: "Payment Requests",
    body: "Create structured payment notes with invoice dates, due dates and shareable records.",
  },
  {
    title: "Dukaan Records",
    body: "Track customer credit, EMI schedules, payment ledgers and closures with disciplined history.",
  },
  {
    title: "Purchase Orders",
    body: "Generate official PO numbers and clean procurement documents.",
  },
  {
    title: "Material Movement",
    body: "Record goods sent, received, transporter details, e-way bill references and route intelligence.",
  },
] as const;

export const LANDING_VALUE_PROFESSIONAL = [
  {
    title: "Professional Briefs",
    body: "Prepare structured briefs for CA, tax, compliance and legal review.",
  },
  {
    title: "Letterhead Documents",
    body: "Write on your own uploaded letterhead without platform branding.",
  },
  {
    title: "Work & Team Notes",
    body: "Capture staff notes, work updates and follow-ups without clutter.",
  },
  {
    title: "Saved Records Hub",
    body: "Access every created record, draft, PDF and business memory from one place.",
  },
] as const;

export const LANDING_TECH = {
  title: "Technical Superiority",
  subtitle: "Every record is designed to become searchable business memory — not just another note.",
  nodes: ["Input", "Structured Record", "Secure Save", "PDF/Text Share", "Search/Insights"],
  bullets: [
    "Stable record identity across edits and sync",
    "Duplicate-save protection via idempotency patterns",
    "On-device PDF generation with user-controlled sharing",
    "User-scoped business insights from your own records",
    "Multilingual UI with fixed en-IN business formatting",
    "Architecture supports production-grade identity and cloud sync when configured",
  ],
} as const;

export const LANDING_SECURITY = {
  title: "Built with compliance-grade product discipline",
  bullets: [
    "Explicit consent-first onboarding",
    "Account and data deletion pathway",
    "User-scoped business records",
    "Optional location access — foreground only",
    "No broad contact-book upload",
    "No translation of user-entered business data",
    "No claim of legal, tax, NBFC or KYC verification services",
  ],
} as const;

export const LANDING_CTA = {
  headline: "Bring order to daily business records.",
  subtext:
    "Start with a secure mobile-first account and build a searchable record trail for your business.",
  primary: "Start Securely",
  secondary: "Contact SPECIAL SOFTWARES",
} as const;

export const LANDING_FOOTER = {
  product: {
    title: "Product",
    links: [
      { label: "Platform", section: "platform" as const },
      { label: "Records", section: "workflows" as const },
      { label: "Dukaan", section: "workflows" as const },
      { label: "Material Movement", section: "workflows" as const },
      { label: "Professional Briefs", section: "workflows" as const },
    ],
  },
  trust: {
    title: "Trust",
    links: [
      { label: "Privacy Policy", doc: "privacy" as const },
      { label: "Terms of Use", doc: "terms" as const },
      { label: "Account Deletion", external: "deletion" as const },
      { label: "Data Safety", doc: "privacy" as const },
    ],
  },
  company: {
    title: "Company",
  },
  legal: {
    title: "Legal",
    tagline1: "All your business needs, in one place",
    tagline2: "We support your business",
  },
} as const;

export const LANDING_PREVIEW = {
  metrics: [
    { label: "Records created", value: "128" },
    { label: "PDFs generated", value: "34" },
    { label: "Dukaan balance", value: "₹42,500" },
    { label: "Material movement", value: "18 trips" },
    { label: "Saved drafts", value: "3" },
    { label: "Approx. KM tracked", value: "1,240 km" },
  ],
  documentTitle: "Payment Request",
  documentRows: [
    { label: "Party", value: "Sharma Traders" },
    { label: "Amount", value: "₹18,500" },
    { label: "Due date", value: "15 Apr 2026" },
  ],
  documentFooter: "Created using Vyaamikk Diary",
} as const;
