/** Statutory Information i18n (EN) — points 1–32. Update when rules change. */
const statutoryEn = {
  tabLabel: "Statutory",
  tabTitle: "Statutory Information",
  tabSubtitle: "Standard due dates — informational only",
  disclaimer:
    "Vyaamikk Diary provides general statutory date information for convenience. Applicability depends on your registration, turnover, filing frequency and facts. Due dates may change by government notification. Please verify on the official portal or with your CA/CS/tax professional.",
  loadError: "Couldn't load statutory information.",
  filters: {
    all: "All",
    GST: "GST",
    IncomeTax: "Income Tax",
    TDS_TCS: "TDS / TCS",
    LLP: "LLP",
  },
  urgency: {
    "1": "Due within 1 day",
    "3": "Due within 3 days",
    "5": "Due within 5 days",
    "7": "Due within 7 days",
    later: "Later",
  },
  sections: { reference: "Reference notes", dismissed: "Dismissed / read" },
  empty: {
    title: "No upcoming statutory notices",
    message: "When a standard due date is within the reminder window, it will appear here.",
  },
  display: {
    periodLine: "{{period}} period",
    dueLine: "Due: {{date}}",
  },
  card: {
    due: "Due {{date}} · {{days}} days left",
    daysLeft: "{{days}} days left",
  },
  calendar: {
    section: "Statutory information",
    markerSubtitle: "Informational — verify applicability",
    legendStatutory: "Statutory",
  },
  prompt: {
    title: "Statutory information",
    subtitle: "A few standard due dates may be relevant soon.",
    dueLine: "Due {{date}} · {{days}} days left",
    footer: "Information only. Due dates may change by notification.",
    okThanks: "Ok, thanks for informing",
    laterToday: "Inform me later today",
    openTab: "Open Statutory Information",
  },
  caution: {
    standard:
      "Standard deadline shown. Government may extend or alter due dates by notification. Verify on GST portal or with your professional.",
    income_tax:
      "Standard Income Tax timeline shown. Due dates may be extended. Verify on the Income Tax portal or with your professional.",
    mca: "Standard MCA timeline shown. Fees and dates may change. Verify on MCA portal or with your professional.",
  },
  source: {
    gst_portal: "Indicative — GST portal FAQ / notifications",
    income_tax: "Indicative — Income Tax Department guidance",
    mca: "Indicative — MCA LLP compliance",
  },
  notes: {
    gst_interest:
      "If applicable, delayed GST tax payment may attract interest (Section 50 CGST — commonly 18% p.a. subject to notification).",
    gst_late_fee:
      "If applicable, delayed GST returns may attract late fee (often cited ₹50/day, ₹20/day nil returns — subject to caps/waivers).",
    it_234bc:
      "If applicable, default/deferment of advance tax may attract interest under sections 234B/234C.",
    it_234f:
      "If applicable, belated ITR may attract fee under section 234F (e.g. ₹5,000 / ₹1,000 by income slab).",
    tds_234e: "If applicable, late TDS return may attract fee under section 234E (₹200/day, capped).",
    tds_interest:
      "If applicable, TDS default may attract interest — consult your professional; app does not compute.",
    llp_late_fee:
      "If applicable, delayed LLP Form 8/11 may attract MCA additional fees — verify current MCA fee slab.",
  },
  templates: {
    gst_gstr1_monthly: {
      title: "GSTR-1 (monthly)",
      applicability: "If you file monthly GSTR-1 for outward supplies.",
      body: "Standard due date is generally the 11th of the succeeding month.",
    },
    gst_gstr1_quarterly: {
      title: "GSTR-1 (quarterly / QRMP)",
      applicability: "If you file quarterly GSTR-1 under QRMP.",
      body: "Standard due date is generally the 13th of the month after the quarter.",
    },
    gst_gstr3b_monthly: {
      title: "GSTR-3B (monthly)",
      applicability: "If you file monthly GSTR-3B summary return and pay GST.",
      body: "Standard due date is generally the 20th of the succeeding month.",
    },
    gst_gstr3b_qrmp: {
      title: "GSTR-3B (QRMP quarterly)",
      applicability: "If you file quarterly GSTR-3B under QRMP (State/UT may affect day).",
      body: "Standard due date is generally the 22nd or 24th after the quarter — verify for your State/UT.",
    },
    gst_qrmp_pmt06: {
      title: "QRMP PMT-06 (monthly tax)",
      applicability: "If you are on QRMP and must pay tax monthly for the first two months of the quarter.",
      body: "PMT-06 challan is generally due by the 25th of the next month.",
    },
    gst_cmp08: {
      title: "CMP-08 (composition)",
      applicability: "If you are a composition taxpayer.",
      body: "CMP-08 statement/payment is generally due by the 18th after the quarter.",
    },
    gst_gstr4_annual: {
      title: "GSTR-4 (annual — composition)",
      applicability: "If you must file annual GSTR-4 as a composition taxpayer.",
      body: "Generally due by 30 April after the financial year (extensions possible).",
    },
    gst_gstr9_annual: {
      title: "GSTR-9 (annual return)",
      applicability: "If you must file GST annual return (turnover/category dependent).",
      body: "Generally due by 31 December following the financial year unless exempted/extended.",
    },
    gst_gstr9c_annual: {
      title: "GSTR-9C (reconciliation)",
      applicability: "If turnover threshold requires reconciliation statement / self-certification.",
      body: "Generally due by 31 December following the financial year unless extended.",
    },
    gst_note_interest: {
      title: "GST interest on delayed payment",
      applicability: "If GST tax was paid after the due date.",
      body: "Interest may apply on delayed tax (Section 50 — rate per notification, commonly up to 18% p.a.).",
    },
    gst_note_late_fee: {
      title: "GST late fee on delayed returns",
      applicability: "If a GST return was filed late.",
      body: "Late fee may apply (Section 47 framework; amounts vary by form/notification).",
    },
    it_advance_general: {
      applicability: "If your estimated annual tax liability exceeds ₹10,000.",
    },
    it_advance_jun: {
      title: "Advance tax — 15 June",
      body: "If required, cumulative 15% of estimated liability is generally due by 15 June.",
    },
    it_advance_sep: {
      title: "Advance tax — 15 September",
      body: "If required, cumulative 45% is generally due by 15 September.",
    },
    it_advance_dec: {
      title: "Advance tax — 15 December",
      body: "If required, cumulative 75% is generally due by 15 December.",
    },
    it_advance_mar: {
      title: "Advance tax — 15 March",
      body: "If required, 100% cumulative is generally due by 15 March.",
    },
    it_presumptive_mar: {
      title: "Advance tax — presumptive (44AD/44ADA)",
      applicability: "If you are on presumptive taxation under 44AD/44ADA.",
      body: "Generally 100% advance tax by 15 March (payments up to 31 March may still count as advance tax).",
    },
    it_itr_salaried: {
      title: "ITR — salaried / non-audit individual",
      applicability: "If you must file ITR as a salaried or ordinary non-audit individual.",
      body: "Usual due date is 31 July of the assessment year unless extended (e.g. 31 August for some AY categories).",
    },
    it_itr_business_non_audit: {
      title: "ITR — business/profession (non-audit)",
      applicability: "If you must file business/profession ITR without tax audit.",
      body: "For many cases 31 August applies for AY 2026-27 — confirm your category on the portal.",
    },
    it_itr_audit: {
      title: "ITR — audit cases",
      applicability: "If your accounts are subject to tax audit.",
      body: "Common due date is 31 October of the assessment year unless extended.",
    },
    it_tax_audit_report: {
      title: "Tax audit report (3CA/3CB-3CD)",
      applicability: "If tax audit applies and ITR due date is 31 October.",
      body: "Audit report is generally due by 30 September (one month before ITR due date).",
    },
    it_itr_transfer_pricing: {
      title: "ITR — transfer pricing cases",
      applicability: "If international/specified domestic transactions apply.",
      body: "Common ITR due date is 30 November; confirm report timelines with your professional.",
    },
    it_tp_report_92e: {
      title: "Accountant report (Section 92E)",
      applicability: "If international transaction reporting applies.",
      body: "Report is generally due about one month before the applicable ITR due date (e.g. 31 October).",
    },
    tds_monthly_deposit: {
      title: "TDS monthly deposit",
      applicability: "If you deduct TDS as a non-government deductor.",
      body: "Generally due by the 7th of the next month; March deductions by 30 April.",
    },
    tds_return: { applicability: "If you file quarterly TDS returns (24Q/26Q/27Q etc.)." },
    tds_return_q1: { title: "TDS return Q1 (Apr–Jun)", body: "Generally due by 31 July." },
    tds_return_q2: { title: "TDS return Q2 (Jul–Sep)", body: "Generally due by 31 October." },
    tds_return_q3: { title: "TDS return Q3 (Oct–Dec)", body: "Generally due by 31 January." },
    tds_return_q4: { title: "TDS return Q4 (Jan–Mar)", body: "Generally due by 31 May." },
    tds_certificate_note: {
      title: "TDS certificates (16 / 16A)",
      applicability: "If you issue TDS certificates to deductees.",
      body: "Form 16A generally quarterly after return processing; Form 16 annually for salary.",
    },
    llp_form11: {
      title: "LLP Form 11 — Annual Return",
      applicability: "If you have an LLP (even with no activity).",
      body: "Due by 30 May each year (within 60 days of financial year end).",
    },
    llp_form8: {
      title: "LLP Form 8 — Accounts & Solvency",
      applicability: "If you have an LLP.",
      body: "Due by 30 October each year.",
    },
    llp_audit_threshold: {
      title: "LLP audit threshold",
      applicability: "If LLP turnover/contribution crosses applicable limits.",
      body: "Audit may apply (commonly cited above ₹40 lakh turnover or ₹25 lakh contribution — verify current law).",
    },
    llp_itr: { applicability: "If your LLP must file Income Tax return (ITR-5)." },
    llp_itr_non_audit: {
      title: "LLP ITR (non-audit)",
      body: "Due date follows non-audit business timeline (often 31 August) — confirm audit applicability.",
    },
    llp_itr_audit: {
      title: "LLP ITR (audit / specified)",
      body: "Often 31 October for audit cases; 30 November for transfer pricing — confirm facts.",
    },
  },
};

export default statutoryEn;
