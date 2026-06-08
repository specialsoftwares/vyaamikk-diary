import type { MasterDataCategory, MasterFieldKey } from "./types";

/** Form input name → canonical master field key (null = no suggestions). */
export const FORM_FIELD_TO_MASTER_KEY: Record<string, MasterFieldKey> = {
  partyName: "partyName",
  customerName: "customerName",
  supplierName: "supplierName",
  staffName: "staffName",
  contactPerson: "personName",
  givenToName: "givenToName",
  transporterName: "transporterName",
  transporter: "transporterName",
  vehicleNumber: "vehicleNumber",
  lrGrNumber: "lrGrNumber",
  invoiceNumber: "invoiceNumber",
  billNumber: "billNumber",
  invoiceChallan: "billNumber",
  materialName: "materialName",
  dispatchLocation: "dispatchLocation",
  dispatchFromLocation: "dispatchLocation",
  destination: "deliveryLocation",
  deliveryLocation: "deliveryLocation",
  receivedLocation: "receivedAtLocation",
  receivedAt: "receivedAtLocation",
  clarificationContactName: "clarificationContactName",
  clarificationContactMobile: "clarificationContactMobile",
  bankName: "bankName",
  bankAccountHolder: "accountHolderName",
  bankUpiId: "upiId",
  sitePlace: "sitePlace",
  responsiblePerson: "personName",
  dispatchTitle: "partyName",
  gstin: "gstin",
  name: "personName",
  designation: "personName",
  place: "deliveryLocation",
  subject: "partyName",
  professionalName: "personName",
  professionalContact: "clarificationContactMobile",
  itemMaterial: "materialName",
  purposeSubject: "partyName",
};

/** Keys that may satisfy a query for a given form field. */
export function queryKeysForFieldKey(fieldKey: MasterFieldKey): MasterFieldKey[] {
  switch (fieldKey) {
    case "partyName":
      return ["partyName", "customerName"];
    case "customerName":
      return ["customerName", "partyName"];
    case "deliveryLocation":
      return ["deliveryLocation", "dispatchLocation", "receivedAtLocation"];
    case "dispatchLocation":
      return ["dispatchLocation", "deliveryLocation"];
    case "receivedAtLocation":
      return ["receivedAtLocation", "deliveryLocation"];
    case "personName":
      return ["personName", "clarificationContactName", "givenToName", "staffName"];
    default:
      return [fieldKey];
  }
}

export function categoryForFieldKey(key: MasterFieldKey): MasterDataCategory {
  switch (key) {
    case "partyName":
    case "customerName":
    case "businessName":
      return "party";
    case "staffName":
      return "staff";
    case "givenToName":
    case "personName":
    case "clarificationContactName":
      return "person";
    case "transporterName":
    case "vehicleNumber":
    case "lrGrNumber":
      return "logistics";
    case "materialName":
    case "supplierName":
      return "material";
    case "dispatchLocation":
    case "deliveryLocation":
    case "receivedAtLocation":
    case "sitePlace":
      return "location";
    case "gstin":
      return "tax";
    case "bankName":
    case "accountHolderName":
    case "upiId":
      return "bank";
    case "invoiceNumber":
    case "billNumber":
    case "clarificationContactMobile":
      return "other";
    default:
      return "other";
  }
}

export function masterKeyForFormField(formFieldName: string): MasterFieldKey | null {
  return FORM_FIELD_TO_MASTER_KEY[formFieldName] ?? null;
}

/** Professional pack matter field keys eligible for master-data ingest / suggestions. */
export const PRO_PACK_FIELD_INGEST: Partial<Record<string, MasterFieldKey>> = {
  gstin: "gstin",
  deducteeParty: "partyName",
  entityName: "businessName",
  personName: "personName",
  employeeName: "staffName",
  debtorName: "partyName",
  counterparty: "partyName",
  otherParty: "partyName",
  lessorLessee: "personName",
  parties: "partyName",
  invoiceReference: "invoiceNumber",
  noticeReference: "billNumber",
  caseReference: "billNumber",
  courtName: "dispatchLocation",
  filingForm: "partyName",
  changeType: "partyName",
  kycAction: "partyName",
  markOrIp: "materialName",
};

export function masterKeyForProPackField(fieldKey: string): MasterFieldKey | null {
  return PRO_PACK_FIELD_INGEST[fieldKey] ?? null;
}

/** Never ingest these form fields into master data. */
export const INGEST_BLOCKLIST_FORM_FIELDS = new Set([
  "amount",
  "pendingAmount",
  "paymentDate",
  "entryDate",
  "invoiceDate",
  "dueDate",
  "billDate",
  "matterDate",
  "date",
  "notes",
  "remarks",
  "requestNote",
  "matterDetails",
  "workDone",
  "issueProblem",
  "issueNote",
  "body",
  "closing",
  "bankAccountNumber",
  "bankIfsc",
  "bankPaymentInstruction",
  "purpose",
  "title",
  "matterSummary",
]);
