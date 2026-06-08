import type { BusinessEntryType } from "@/domain/businessEntry";
import type { MatterTypeDef } from "@/domain/professionalPack";
import { buildPostalDisplayLabel } from "@/utils/location/postalDisplay";
import {
  buildIndianPostalFromForm,
  postalFormField,
  type PostalFieldPrefix,
} from "@/utils/location/postalForm";

import {
  INGEST_BLOCKLIST_FORM_FIELDS,
  masterKeyForFormField,
  PRO_PACK_FIELD_INGEST,
} from "./fieldKeys";
import { isJunkMasterValue } from "./normalize";
import { masterDataRepository } from "./masterDataRepository";
import type { MasterDataUserScope, MasterFieldKey } from "./types";

async function ingestValue(
  scope: MasterDataUserScope,
  fieldKey: MasterFieldKey,
  value: string,
  sourceRecordType: string,
  sourceField: string
): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed || isJunkMasterValue(trimmed)) return;
  await masterDataRepository.upsert({
    scope,
    fieldKey,
    value: trimmed,
    sourceRecordType,
    sourceField,
  });
}

function ingestFormStrings(
  scope: MasterDataUserScope,
  values: Record<string, unknown>,
  sourceRecordType: string,
  extraKeys?: string[]
): void {
  const keys = new Set<string>(Object.keys(values));
  if (extraKeys) extraKeys.forEach((k) => keys.add(k));

  for (const formKey of keys) {
    if (INGEST_BLOCKLIST_FORM_FIELDS.has(formKey)) continue;
    const fieldKey = masterKeyForFormField(formKey);
    if (!fieldKey) continue;
    const raw = values[formKey];
    if (typeof raw !== "string") continue;
    void ingestValue(scope, fieldKey, raw, sourceRecordType, formKey);
  }
}

async function ingestPostalFromForm(
  scope: MasterDataUserScope,
  values: Record<string, unknown>,
  prefix: PostalFieldPrefix,
  locationFieldKey: MasterFieldKey,
  sourceRecordType: string
): Promise<void> {
  const postal = buildIndianPostalFromForm(prefix, values);
  if (!postal) return;
  const label =
    postal.displayLabel?.trim() || buildPostalDisplayLabel(postal)?.trim() || "";
  if (!label) return;
  await ingestValue(scope, locationFieldKey, label, sourceRecordType, postalFormField(prefix, "DisplayLabel"));
}

export async function ingestComposerForm(
  scope: MasterDataUserScope,
  entryType: BusinessEntryType,
  values: Record<string, unknown>
): Promise<void> {
  ingestFormStrings(scope, values, entryType);

  switch (entryType) {
    case "payment_request":
      await ingestPostalFromForm(scope, values, "party", "deliveryLocation", entryType);
      break;
    case "material_dispatched":
      await ingestPostalFromForm(scope, values, "dispatchFrom", "dispatchLocation", entryType);
      await ingestPostalFromForm(scope, values, "deliveryTo", "deliveryLocation", entryType);
      break;
    case "material_received":
      await ingestPostalFromForm(scope, values, "receivedAt", "receivedAtLocation", entryType);
      await ingestPostalFromForm(scope, values, "party", "supplierName", entryType);
      break;
    case "outward_freight_details":
      await ingestPostalFromForm(scope, values, "dispatchFrom", "dispatchLocation", entryType);
      await ingestPostalFromForm(scope, values, "deliveryTo", "deliveryLocation", entryType);
      break;
    default:
      break;
  }
}

export async function ingestLetterheadForm(
  scope: MasterDataUserScope,
  values: Record<string, unknown>
): Promise<void> {
  const allowed = ["name", "designation", "place", "subject"] as const;
  for (const key of allowed) {
    const fieldKey = masterKeyForFormField(key);
    if (!fieldKey) continue;
    const raw = values[key];
    if (typeof raw === "string") {
      await ingestValue(scope, fieldKey, raw, "letterhead", key);
    }
  }
}

export async function ingestProfessionalPackForm(
  scope: MasterDataUserScope,
  matterDef: MatterTypeDef,
  values: Record<string, unknown>
): Promise<void> {
  for (const def of matterDef.fields) {
    if (def.kind === "multiline" || def.kind === "amount" || def.kind === "date") continue;
    const fieldKey = PRO_PACK_FIELD_INGEST[def.key] ?? null;
    if (!fieldKey) continue;
    const raw = values[def.key];
    if (typeof raw !== "string") continue;
    await ingestValue(scope, fieldKey, raw, `pro_pack:${matterDef.type}`, def.key);
  }
  const profName = values.professionalName;
  if (typeof profName === "string") {
    await ingestValue(scope, "personName", profName, `pro_pack:${matterDef.type}`, "professionalName");
  }
  const contact = values.professionalContact;
  if (typeof contact === "string") {
    await ingestValue(
      scope,
      "clarificationContactMobile",
      contact,
      `pro_pack:${matterDef.type}`,
      "professionalContact"
    );
  }
}
