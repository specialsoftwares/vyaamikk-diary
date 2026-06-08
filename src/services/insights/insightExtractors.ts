import type { BusinessEntry } from "@/domain/businessEntry";
import type { IndianPostalLocation } from "@/domain/indianPostal";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { InsightSourceRecordType } from "@/domain/businessInsight";
import { getFinancialYearForDate } from "@/utils/financialYear";
import { normalizePartyKey, normalizePinKey } from "./businessInsightRepository";

export interface PartyTouch {
  partyName: string;
  pin: string | null;
  locality: string | null;
  state: string | null;
  source: string;
}

export interface PinTouch {
  pin: string;
  locality: string | null;
  district: string | null;
  state: string | null;
  resolved: boolean;
  partyName: string | null;
}

export interface CashPaidTouch {
  amount: number;
  givenToName: string;
  recordDateMs: number;
}

function postalPin(postal: IndianPostalLocation | null | undefined): string | null {
  const pin = postal?.pinCode?.trim();
  return pin && pin.length === 6 ? pin : null;
}

function postalMeta(postal: IndianPostalLocation | null | undefined) {
  if (!postal?.pinCode) return null;
  return {
    pin: postal.pinCode,
    locality: postal.locality ?? postal.displayLabel?.split(",")[0]?.trim() ?? null,
    district: postal.district ?? null,
    state: postal.state ?? null,
    resolved: Boolean(postal.state || postal.district || postal.locality),
  };
}

export function extractPartiesFromEntry(entry: BusinessEntry): PartyTouch[] {
  const p = entry.payload as unknown as Record<string, unknown>;
  const dateMs = entry.entryDate;
  const out: PartyTouch[] = [];

  const add = (name: string | null | undefined, source: string, postal?: IndianPostalLocation | null) => {
    const n = name?.trim();
    if (!n || n.length < 2) return;
    const meta = postalMeta(postal);
    out.push({
      partyName: n,
      pin: meta?.pin ?? null,
      locality: meta?.locality ?? null,
      state: meta?.state ?? null,
      source,
    });
  };

  switch (entry.entryType) {
    case "payment_request":
      add(p.partyName as string, "payment_request", p.partyPostal as IndianPostalLocation);
      break;
    case "material_dispatched":
      add(p.partyName as string, "material_dispatch", p.dispatchFromPostal as IndianPostalLocation);
      break;
    case "material_received":
      add(p.supplierName as string, "material_receipt", p.supplierPostal as IndianPostalLocation);
      break;
    case "material_return":
      add(p.partyName as string, "material_return", p.returnFromPostal as IndianPostalLocation);
      break;
    case "business_cash_given":
      add(p.givenToName as string, "cash_paid");
      break;
    case "outward_freight_details":
      add(p.partyName as string, "freight", p.dispatchFromPostal as IndianPostalLocation);
      add(p.transporterName as string, "freight_transporter");
      break;
    default:
      break;
  }
  void dateMs;
  return out;
}

export function extractPinsFromEntry(entry: BusinessEntry): PinTouch[] {
  const p = entry.payload as unknown as Record<string, unknown>;
  const out: PinTouch[] = [];
  const partyFor = (name: string | null | undefined) => name?.trim() || null;

  const addPostal = (postal: IndianPostalLocation | null | undefined, partyName: string | null) => {
    const pin = postalPin(postal);
    if (!pin) return;
    const meta = postalMeta(postal);
    out.push({
      pin,
      locality: meta?.locality ?? null,
      district: meta?.district ?? null,
      state: meta?.state ?? null,
      resolved: meta?.resolved ?? false,
      partyName,
    });
  };

  switch (entry.entryType) {
    case "payment_request":
      addPostal(p.partyPostal as IndianPostalLocation, partyFor(p.partyName as string));
      break;
    case "material_dispatched":
      addPostal(p.dispatchFromPostal as IndianPostalLocation, partyFor(p.partyName as string));
      addPostal(p.deliveryToPostal as IndianPostalLocation, partyFor(p.partyName as string));
      break;
    case "material_received":
      addPostal(p.supplierPostal as IndianPostalLocation, partyFor(p.supplierName as string));
      addPostal(p.receivedAtPostal as IndianPostalLocation, partyFor(p.supplierName as string));
      break;
    case "material_return":
      addPostal(p.returnFromPostal as IndianPostalLocation, partyFor(p.partyName as string));
      addPostal(p.returnToPostal as IndianPostalLocation, partyFor(p.partyName as string));
      break;
    case "outward_freight_details":
      addPostal(p.dispatchFromPostal as IndianPostalLocation, partyFor(p.partyName as string));
      addPostal(p.deliveryToPostal as IndianPostalLocation, partyFor(p.partyName as string));
      break;
    default:
      break;
  }
  return out;
}

export function extractCashPaidFromEntry(entry: BusinessEntry): CashPaidTouch | null {
  if (entry.entryType !== "business_cash_given" || entry.deletedAt) return null;
  const p = entry.payload as { amount?: number; givenToName?: string };
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    givenToName: String(p.givenToName ?? "").trim(),
    recordDateMs: entry.entryDate,
  };
}

export function extractPartiesFromPurchaseOrder(po: PurchaseOrder): PartyTouch[] {
  if (po.deletedAt) return [];
  const out: PartyTouch[] = [];
  const add = (name: string, source: string, pin?: string | null, state?: string | null) => {
    const n = name.trim();
    if (n.length < 2) return;
    out.push({ partyName: n, pin: pin ?? null, locality: null, state: state ?? null, source });
  };
  add(po.vendorName, "purchase_order_vendor", po.vendorPin, po.vendorState);
  add(po.buyerName, "purchase_order_buyer", po.buyerPin, po.buyerState);
  if (po.shipName?.trim()) {
    add(po.shipName, "purchase_order_ship", po.shipPin, po.shipState);
  }
  return out;
}

export function extractPinsFromPurchaseOrder(po: PurchaseOrder): PinTouch[] {
  if (po.deletedAt) return [];
  const out: PinTouch[] = [];
  const add = (pin: string | null | undefined, state: string | null | undefined, party: string) => {
    const p = pin?.replace(/\D/g, "").slice(0, 6);
    if (!p || p.length !== 6) return;
    out.push({
      pin: p,
      locality: null,
      district: null,
      state: state?.trim() || null,
      resolved: Boolean(state?.trim()),
      partyName: party.trim() || null,
    });
  };
  add(po.vendorPin, po.vendorState, po.vendorName);
  add(po.buyerPin, po.buyerState, po.buyerName);
  if (po.shipPin) add(po.shipPin, po.shipState, po.shipName ?? "");
  return out;
}

export function extractPinsFromCustomerCredit(rec: CustomerCreditRecord): PinTouch[] {
  if (rec.deletedAt) return [];
  const pin = rec.customerPin?.replace(/\D/g, "").slice(0, 6);
  if (!pin || pin.length !== 6) return [];
  return [
    {
      pin,
      locality: rec.customerLocality ?? rec.customerCity ?? null,
      district: rec.customerCity ?? null,
      state: rec.customerState ?? null,
      resolved: Boolean(rec.customerState || rec.customerCity),
      partyName: rec.customerName,
    },
  ];
}

export function entryRecordDate(entry: BusinessEntry): number {
  return entry.entryDate || entry.createdAt;
}

export function fyForEntry(entry: BusinessEntry): number {
  return getFinancialYearForDate(entryRecordDate(entry));
}

export function fyForMs(ms: number): number {
  return getFinancialYearForDate(ms);
}

export function sourceTypeDiary(): InsightSourceRecordType {
  return "diary_entry";
}

export { normalizePartyKey, normalizePinKey };
