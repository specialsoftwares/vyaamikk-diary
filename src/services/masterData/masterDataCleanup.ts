import type { BusinessEntry } from "@/domain/businessEntry";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { buildPostalDisplayLabel } from "@/utils/location/postalDisplay";

import { FORM_FIELD_TO_MASTER_KEY } from "./fieldKeys";
import { masterDataRepository } from "./masterDataRepository";
import { isJunkMasterValue, normalizeMasterValue } from "./normalize";
import type { MasterDataUserScope, MasterFieldKey } from "./types";

type FieldValue = { fieldKey: MasterFieldKey; value: string };

function collectStringFields(
  obj: Record<string, unknown>,
  sourceRecordType: string
): FieldValue[] {
  const out: FieldValue[] = [];
  for (const [key, raw] of Object.entries(obj)) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || isJunkMasterValue(trimmed)) continue;
    const fieldKey = FORM_FIELD_TO_MASTER_KEY[key];
    if (!fieldKey) continue;
    out.push({ fieldKey, value: trimmed });
  }
  return out;
}

function collectFromEntry(entry: BusinessEntry): FieldValue[] {
  const payload = entry.payload as unknown as Record<string, unknown>;
  const values = collectStringFields(payload, entry.entryType);

  const postalPairs: Array<{ postal: unknown; locationKey: MasterFieldKey }> = [
    { postal: payload.dispatchFromPostal, locationKey: "dispatchLocation" },
    { postal: payload.deliveryToPostal, locationKey: "deliveryLocation" },
    { postal: payload.receivedAtPostal, locationKey: "receivedAtLocation" },
    { postal: payload.supplierPostal, locationKey: "supplierName" },
    { postal: payload.partyPostal, locationKey: "deliveryLocation" },
  ];

  for (const { postal, locationKey } of postalPairs) {
    if (!postal || typeof postal !== "object") continue;
    const p = postal as { displayLabel?: string };
    const label = p.displayLabel?.trim() || buildPostalDisplayLabel(postal as never)?.trim();
    if (label && !isJunkMasterValue(label)) {
      values.push({ fieldKey: locationKey, value: label });
    }
  }

  if (entry.location?.name?.trim()) {
    values.push({ fieldKey: "sitePlace", value: entry.location.name.trim() });
  }

  return values;
}

function collectFromProfessionalPack(pack: ProfessionalServicePack): FieldValue[] {
  const values = collectStringFields(pack.facts as Record<string, unknown>, pack.matterType);
  if (pack.professionalName?.trim()) {
    values.push({ fieldKey: "personName", value: pack.professionalName.trim() });
  }
  if (pack.professionalContact?.trim()) {
    values.push({
      fieldKey: "clarificationContactMobile",
      value: pack.professionalContact.trim(),
    });
  }
  return values;
}

function collectFromPurchaseOrder(po: PurchaseOrder): FieldValue[] {
  const values: FieldValue[] = [];
  if (po.vendorName?.trim()) values.push({ fieldKey: "partyName", value: po.vendorName.trim() });
  if (po.deliveryLocation?.trim()) {
    values.push({ fieldKey: "deliveryLocation", value: po.deliveryLocation.trim() });
  }
  for (const item of po.items) {
    if (item.itemName?.trim()) {
      values.push({ fieldKey: "materialName", value: item.itemName.trim() });
    }
  }
  return values;
}

function collectFromCustomerCredit(rec: CustomerCreditRecord): FieldValue[] {
  const values: FieldValue[] = [];
  if (rec.customerName?.trim()) {
    values.push({ fieldKey: "customerName", value: rec.customerName.trim() });
  }
  for (const p of rec.products) {
    if (p.productName?.trim()) {
      values.push({ fieldKey: "materialName", value: p.productName.trim() });
    }
  }
  return values;
}

/** Decrement usage for values contributed by a deleted record; remove row when count hits zero. */
export async function pruneMasterDataAfterRecordDelete(
  scope: MasterDataUserScope,
  fieldValues: FieldValue[]
): Promise<void> {
  if (!fieldValues.length) return;
  const seen = new Set<string>();
  for (const { fieldKey, value } of fieldValues) {
    const normalized = normalizeMasterValue(fieldKey, value);
    const dedupeKey = `${fieldKey}:${normalized}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    await masterDataRepository.decrementUsage(scope, fieldKey, normalized);
  }
}

export async function pruneMasterDataForDiaryEntry(
  scope: MasterDataUserScope,
  entry: BusinessEntry
): Promise<void> {
  await pruneMasterDataAfterRecordDelete(scope, collectFromEntry(entry));
}

export async function pruneMasterDataForProfessionalPack(
  scope: MasterDataUserScope,
  pack: ProfessionalServicePack
): Promise<void> {
  await pruneMasterDataAfterRecordDelete(scope, collectFromProfessionalPack(pack));
}

export async function pruneMasterDataForPurchaseOrder(
  scope: MasterDataUserScope,
  po: PurchaseOrder
): Promise<void> {
  await pruneMasterDataAfterRecordDelete(scope, collectFromPurchaseOrder(po));
}

export async function pruneMasterDataForCustomerCredit(
  scope: MasterDataUserScope,
  rec: CustomerCreditRecord
): Promise<void> {
  await pruneMasterDataAfterRecordDelete(scope, collectFromCustomerCredit(rec));
}
