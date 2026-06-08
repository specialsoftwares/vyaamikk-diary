import type {
  MatterFieldDef,
  MatterTypeDef,
  ProfessionalCategory,
  ProfessionalMatterType,
} from "./professionalPack";

const summary: MatterFieldDef = {
  key: "matterSummary",
  labelKey: "matterSummary",
  required: true,
  kind: "multiline",
};

function f(
  key: string,
  labelKey: string,
  kind: MatterFieldDef["kind"] = "text",
  required = true
): MatterFieldDef {
  return { key, labelKey, required, kind };
}

function matter(
  type: ProfessionalMatterType,
  category: ProfessionalCategory,
  labelKey: string,
  pdfTitleKey: string,
  fields: MatterFieldDef[]
): MatterTypeDef {
  return { type, category, labelKey, pdfTitleKey, fields: [summary, ...fields] };
}

export const PROFESSIONAL_MATTER_TYPES: MatterTypeDef[] = [
  // CA / Tax
  matter("gst_return_support", "ca_tax", "gstReturnSupport", "pdfGstReturn", [
    f("taxPeriod", "taxPeriod"),
    f("gstin", "gstin", "gstin", false),
    f("returnType", "returnType"),
  ]),
  matter("gst_notice_query", "ca_tax", "gstNoticeQuery", "pdfGstNotice", [
    f("noticeReference", "noticeReference"),
    f("noticeDate", "noticeDate", "date"),
    f("querySummary", "querySummary", "multiline"),
  ]),
  matter("itr_tax_filing_pack", "ca_tax", "itrTaxFiling", "pdfItr", [
    f("assessmentYear", "assessmentYear"),
    f("incomeSources", "incomeSources", "multiline"),
  ]),
  matter("tds_tcs_matter", "ca_tax", "tdsTcs", "pdfTds", [
    f("deducteeParty", "deducteeParty"),
    f("amountInvolved", "amountInvolved", "amount"),
    f("sectionReference", "sectionReference", "text", false),
  ]),
  matter("bookkeeping_support", "ca_tax", "bookkeeping", "pdfBookkeeping", [
    f("periodCovered", "periodCovered"),
    f("recordsAvailable", "recordsAvailable", "multiline"),
  ]),
  matter("expense_cash_review", "ca_tax", "expenseCashReview", "pdfExpenseCash", [
    f("periodCovered", "periodCovered"),
    f("totalAmount", "totalAmount", "amount", false),
    f("reviewPurpose", "reviewPurpose", "multiline"),
  ]),
  // CS / Compliance
  matter("llp_company_compliance", "cs_compliance", "llpCompany", "pdfLlpCompany", [
    f("entityName", "entityName"),
    f("cinLlpin", "cinLlpin", "text", false),
    f("complianceTopic", "complianceTopic", "multiline"),
  ]),
  matter("roc_filing_reminder", "cs_compliance", "rocFiling", "pdfRoc", [
    f("entityName", "entityName"),
    f("filingForm", "filingForm"),
    f("dueDateNote", "dueDateNote", "date", false),
  ]),
  matter("board_resolution_brief", "cs_compliance", "boardResolution", "pdfBoard", [
    f("entityName", "entityName"),
    f("resolutionSubject", "resolutionSubject", "multiline"),
  ]),
  matter("annual_filing_checklist", "cs_compliance", "annualFiling", "pdfAnnual", [
    f("entityName", "entityName"),
    f("financialYear", "financialYear"),
  ]),
  matter("din_dsc_kyc_reminder", "cs_compliance", "dinDscKyc", "pdfDinDsc", [
    f("personName", "personName"),
    f("dinNumber", "dinNumber", "text", false),
    f("kycAction", "kycAction"),
  ]),
  matter("entity_change_compliance", "cs_compliance", "entityChange", "pdfEntityChange", [
    f("entityName", "entityName"),
    f("changeType", "changeType"),
    f("changeDetails", "changeDetails", "multiline"),
  ]),
  // Legal
  matter("payment_recovery", "legal", "paymentRecovery", "pdfPaymentRecovery", [
    f("debtorName", "debtorName"),
    f("amountDue", "amountDue", "amount"),
    f("invoiceReference", "invoiceReference", "text", false),
  ]),
  matter("legal_notice_prep", "legal", "legalNoticePrep", "pdfLegalNotice", [
    f("counterparty", "counterparty"),
    f("disputeSummary", "disputeSummary", "multiline"),
  ]),
  matter("agreement_drafting", "legal", "agreementDrafting", "pdfAgreement", [
    f("agreementType", "agreementType"),
    f("parties", "parties"),
    f("commercialTerms", "commercialTerms", "multiline"),
  ]),
  matter("lease_property_review", "legal", "leaseProperty", "pdfLease", [
    f("propertyDescription", "propertyDescription", "multiline"),
    f("lessorLessee", "lessorLessee"),
  ]),
  matter("staff_labour_issue", "legal", "staffLabour", "pdfStaffLabour", [
    f("employeeName", "employeeName"),
    f("issueDescription", "issueDescription", "multiline"),
  ]),
  matter("business_dispute_record", "legal", "businessDispute", "pdfDispute", [
    f("otherParty", "otherParty"),
    f("disputeFacts", "disputeFacts", "multiline"),
  ]),
  matter("trademark_ip_query", "legal", "trademarkIp", "pdfTrademark", [
    f("markOrIp", "markOrIp"),
    f("queryDetails", "queryDetails", "multiline"),
  ]),
  matter("court_case_diary", "legal", "courtCase", "pdfCourt", [
    f("courtName", "courtName"),
    f("caseReference", "caseReference"),
    f("caseStage", "caseStage", "text", false),
  ]),
];

export const MATTERS_BY_CATEGORY: Record<ProfessionalCategory, MatterTypeDef[]> = {
  ca_tax: PROFESSIONAL_MATTER_TYPES.filter((m) => m.category === "ca_tax"),
  cs_compliance: PROFESSIONAL_MATTER_TYPES.filter((m) => m.category === "cs_compliance"),
  legal: PROFESSIONAL_MATTER_TYPES.filter((m) => m.category === "legal"),
};

export function getMatterDef(
  category: ProfessionalCategory,
  matterType: string
): MatterTypeDef | null {
  return (
    PROFESSIONAL_MATTER_TYPES.find(
      (m) => m.category === category && m.type === matterType
    ) ?? null
  );
}

export function isProfessionalCategory(v: string): v is ProfessionalCategory {
  return v === "ca_tax" || v === "cs_compliance" || v === "legal";
}
