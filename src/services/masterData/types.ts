/** User-scoped master data suggestion — private to one authenticated user. */
export type MasterFieldKey =
  | "partyName"
  | "customerName"
  | "supplierName"
  | "staffName"
  | "personName"
  | "givenToName"
  | "transporterName"
  | "vehicleNumber"
  | "lrGrNumber"
  | "invoiceNumber"
  | "billNumber"
  | "materialName"
  | "dispatchLocation"
  | "deliveryLocation"
  | "receivedAtLocation"
  | "clarificationContactName"
  | "clarificationContactMobile"
  | "gstin"
  | "bankName"
  | "accountHolderName"
  | "upiId"
  | "businessName"
  | "sitePlace";

export type MasterDataCategory =
  | "party"
  | "person"
  | "logistics"
  | "material"
  | "location"
  | "tax"
  | "bank"
  | "staff"
  | "other";

export interface MasterDataSuggestion {
  id: string;
  userId: string;
  ueid: string;
  fieldKey: MasterFieldKey;
  value: string;
  normalizedValue: string;
  displayValue: string;
  category: MasterDataCategory;
  sourceRecordType: string | null;
  sourceField: string | null;
  usageCount: number;
  lastUsedAt: number;
  createdAt: number;
  updatedAt: number;
  hiddenAt: number | null;
  metadata: Record<string, string> | null;
}

/** Required on every repository call — never query without this. */
export interface MasterDataUserScope {
  userId: string;
  ueid: string;
}

export interface MasterDataQueryInput {
  scope: MasterDataUserScope;
  fieldKey: MasterFieldKey;
  /** Raw typed prefix (min 1 char before query runs). */
  prefix: string;
  limit?: number;
}

export interface MasterDataUpsertInput {
  scope: MasterDataUserScope;
  fieldKey: MasterFieldKey;
  value: string;
  sourceRecordType?: string | null;
  sourceField?: string | null;
}
