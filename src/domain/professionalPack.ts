/**
 * Professional Service Pack — structured briefs for sharing with the user's
 * own CA, CS, lawyer, or consultant. The app does not provide professional
 * advice or filing services.
 */

import type { AttachmentRef } from "./businessEntry";
import type { EntryReminder, UEID } from "./types";

export type ProfessionalCategory = "ca_tax" | "cs_compliance" | "legal";

export type ProfessionalPackStatus = "active" | "shared" | "completed";

/** All supported matter type ids (stable storage keys). */
export type CaTaxMatterType =
  | "gst_return_support"
  | "gst_notice_query"
  | "itr_tax_filing_pack"
  | "tds_tcs_matter"
  | "bookkeeping_support"
  | "expense_cash_review";

export type CsComplianceMatterType =
  | "llp_company_compliance"
  | "roc_filing_reminder"
  | "board_resolution_brief"
  | "annual_filing_checklist"
  | "din_dsc_kyc_reminder"
  | "entity_change_compliance";

export type LegalMatterType =
  | "payment_recovery"
  | "legal_notice_prep"
  | "agreement_drafting"
  | "lease_property_review"
  | "staff_labour_issue"
  | "business_dispute_record"
  | "trademark_ip_query"
  | "court_case_diary";

export type ProfessionalMatterType =
  | CaTaxMatterType
  | CsComplianceMatterType
  | LegalMatterType;

export interface ProfessionalServicePack {
  id: string;
  userId: string;
  ueid: UEID;
  professionalCategory: ProfessionalCategory;
  matterType: ProfessionalMatterType;
  title: string;
  /** Structured facts keyed by field id (see matter field defs). */
  facts: Record<string, string | number | null>;
  linkedEntryIds: string[];
  attachments: AttachmentRef[];
  /** Primary matter / reference date. */
  matterDate: number;
  dueDate: number | null;
  reminder: EntryReminder | null;
  status: ProfessionalPackStatus;
  professionalName: string | null;
  professionalContact: string | null;
  notes: string | null;
  pdfUri: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Multi-step save progress — coordination only, no PII. */
  completedSteps?: string[];
}

export interface MatterFieldDef {
  key: string;
  /** i18n path: proPack.fields.{key} */
  labelKey: string;
  required: boolean;
  kind: "text" | "multiline" | "amount" | "date" | "gstin" | "email";
}

export interface MatterTypeDef {
  type: ProfessionalMatterType;
  category: ProfessionalCategory;
  labelKey: string;
  pdfTitleKey: string;
  fields: MatterFieldDef[];
}
