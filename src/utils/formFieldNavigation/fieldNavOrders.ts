import type { BusinessEntryType } from "@/domain/businessEntry";

/** Fields where Enter must insert a newline — never advance focus on return. */
export const MULTILINE_FIELD_KEYS = new Set([
  "workDone",
  "issueProblem",
  "matterDetails",
  "remarks",
  "notes",
  "requestNote",
  "issueNote",
  "purpose",
  "bankPaymentInstruction",
  "body",
  "recipientAddress",
  "terms",
  "narrative",
]);

export function isMultilineFieldKey(fieldKey: string, explicitMultiline?: boolean): boolean {
  if (explicitMultiline === true) return true;
  if (explicitMultiline === false) return false;
  return MULTILINE_FIELD_KEYS.has(fieldKey);
}

/** Keyboard next-field order for composer record types (text inputs only). */
export const COMPOSER_NAV_FIELD_ORDER: Partial<Record<BusinessEntryType, string[]>> = {
  business_cash_given: ["amount", "givenToName", "receiverMobile", "count500", "count200", "count100", "count50", "purpose"],
  work_update_issue: ["workDone", "issueProblem", "sitePlace"],
  staff_matter: ["staffName", "matterDetails"],
  material_dispatched: [
    "partyName",
    "dispatchFromPin",
    "deliveryToPin",
    "billChallanNumber",
    "ewayBillNumber",
    "referenceNote",
    "materialName",
    "materialDescription",
    "quantity",
    "unit",
    "totalBoxes",
    "totalWeight",
    "weightUnit",
    "transporterName",
    "lrGrNumber",
    "vehicleNumber",
    "freightAmount",
    "clarificationContactName",
    "clarificationContactMobile",
    "remarks",
    "notes",
  ],
  material_received: [
    "supplierName",
    "materialName",
    "quantity",
    "unit",
    "receivedAtPin",
    "receivedAtCity",
    "receivedAtState",
    "receivedLocation",
    "partyPin",
    "partyCity",
    "partyState",
    "issueNote",
  ],
  payment_request: [
    "partyName",
    "invoiceNumber",
    "pendingAmount",
    "contactPerson",
    "requestNote",
    "bankAccountHolder",
    "bankName",
    "bankAccountNumber",
    "bankIfsc",
    "bankUpiId",
    "bankPaymentInstruction",
  ],
  outward_freight_details: [
    "partyName",
    "dispatchFromPin",
    "deliveryToPin",
    "billChallanNumber",
    "ewayBillNumber",
    "referenceNote",
    "materialName",
    "materialDescription",
    "quantity",
    "unit",
    "totalBoxes",
    "totalWeight",
    "weightUnit",
    "transporterName",
    "lrGrNumber",
    "vehicleNumber",
    "freightAmount",
    "clarificationContactName",
    "clarificationContactMobile",
    "remarks",
    "notes",
  ],
  reminder_purchase: ["itemMaterial"],
  reminder_email: ["purposeSubject"],
};

/** Purchase Order — single-line next flow (multiline: buyer/vendor/ship address, notes, terms). */
export const PURCHASE_ORDER_NAV_FIELD_ORDER: string[] = [
  "referenceNumber",
  "buyerName",
  "buyerGstin",
  "buyerPin",
  "buyerState",
  "buyerAddress",
  "authorizedBy",
  "authorizedDesignation",
  "vendorName",
  "vendorGstin",
  "vendorPin",
  "vendorState",
  "vendorAddress",
  "vendorContactName",
  "vendorContactPhone",
  "vendorContactEmail",
  "shipName",
  "shipAddress",
  "shipPin",
  "shipState",
  "shipContact",
  "gstRateCustom",
  "paymentTerms",
  "deliveryTerms",
  "freightTerms",
  "deliveryLocation",
  "notes",
  "terms",
];

/** Customer Credit create form — navigable text fields. */
export const CUSTOMER_CREDIT_NAV_FIELD_ORDER: string[] = [
  "customerName",
  "customerMobile",
  "customerPin",
  "customerState",
  "customerAddress",
  "productName",
  "productDescription",
  "principalAmount",
  "downPayment",
  "emiAmount",
  "processingFee",
  "lateFeePerDay",
  "remarks",
];

/** Letterhead matter compose — body/recipientAddress multiline. */
export const LETTERHEAD_NAV_FIELD_ORDER: string[] = [
  "title",
  "reference",
  "recipientName",
  "recipientDesignation",
  "recipientCompany",
  "recipientAddress",
  "subject",
  "salutation",
  "body",
  "closing",
  "name",
  "designation",
  "place",
];

/** Profile / business identity onboarding (text inputs — designation uses picker). */
export const BUSINESS_IDENTITY_NAV_FIELD_ORDER: string[] = [
  "displayName",
  "businessName",
  "workType",
];

/** Profile edit panel (text inputs only — designation uses picker). */
export const PROFILE_EDIT_NAV_FIELD_ORDER: string[] = [
  "displayName",
  "businessName",
  "workType",
  "businessEmail",
];

export interface PurchaseOrderNavItem {
  descriptionLines: string[];
  unit: string;
}

/** Dynamic PO keyboard order — matches on-screen field sequence. */
export function buildPurchaseOrderNavOrder(
  items: PurchaseOrderNavItem[],
  options: {
    shipSameAsBuyer: boolean;
    taxApplicable: string;
    gstRateSel: string;
  }
): string[] {
  const order: string[] = [
    "referenceNumber",
    "buyerName",
    "buyerGstin",
    "buyerPin",
    "buyerState",
    "buyerAddress",
    "authorizedBy",
    "authorizedDesignation",
    "vendorName",
    "vendorGstin",
    "vendorPin",
    "vendorState",
    "vendorAddress",
    "vendorContactName",
    "vendorContactPhone",
    "vendorContactEmail",
  ];
  if (!options.shipSameAsBuyer) {
    order.push("shipName", "shipAddress", "shipPin", "shipState", "shipContact");
  }
  if (options.taxApplicable === "applicable" && options.gstRateSel === "custom") {
    order.push("gstRateCustom");
  }
  items.forEach((item, idx) => {
    order.push(`item-${idx}-name`);
    item.descriptionLines.forEach((_line, lineIdx) => {
      order.push(`item-${idx}-desc-${lineIdx}`);
    });
    order.push(`item-${idx}-qty`);
    if (item.unit === "Other") order.push(`item-${idx}-unitOther`);
    order.push(`item-${idx}-rate`);
    if (options.taxApplicable === "applicable") {
      order.push(`item-${idx}-tax`);
    }
  });
  order.push("paymentTerms", "deliveryTerms", "freightTerms", "deliveryLocation", "notes", "terms");
  return order;
}

export interface CustomerCreditNavProduct {
  productName: string;
}

/** Dynamic Customer Credit keyboard order for visible text fields. */
export function buildCustomerCreditNavOrder(options: {
  products: CustomerCreditNavProduct[];
  showFullAddress: boolean;
  paidInFull: boolean;
  showFixed: boolean;
  showInterestPct: boolean;
  showProcessing: boolean;
  usesSchedule: boolean;
  emiFrequency: string;
  usesFinance: boolean;
  hasDocumentType: boolean;
}): string[] {
  const order: string[] = [
    "customerName",
    "customerMobile",
    "customerAltContact",
    "customerPin",
    "city",
    "customerState",
  ];
  if (options.showFullAddress) {
    order.push("addressLine", "locality");
  }
  options.products.forEach((_p, idx) => {
    order.push(
      `product-${idx}-name`,
      `product-${idx}-brandModel`,
      `product-${idx}-serialImei`,
      `product-${idx}-saleAmount`,
      `product-${idx}-invoiceNumber`
    );
  });
  if (options.paidInFull) {
    order.push("paidReference");
  } else {
    order.push("downPayment");
    if (options.showFixed) {
      order.push("chargesAmount", "chargesLabel");
    }
    if (options.showInterestPct) {
      order.push("interestPercent");
    }
    if (options.showProcessing) {
      order.push("processingPercent", "processingAmount");
    }
    if (options.usesSchedule) {
      order.push("emiCount");
      if (options.emiFrequency === "custom") {
        order.push("customIntervalDays");
      }
    }
  }
  if (options.usesFinance) {
    order.push("financerName", "financeRefNumber", "financeAmount", "financeDownPayment");
  }
  if (options.hasDocumentType) {
    order.push("documentReference");
  }
  order.push("remarks");
  return order;
}
