/**
 * Production cloud protection for the remaining business records.
 * Operational fields (ids, status, dates, serials, amounts, quota) stay readable.
 * Shared-dev and local-mock stay plaintext.
 */

import { AppError } from "@/domain/errors";
import { getActiveBackend } from "@/config/env";
import {
  shouldCreateContentSeals,
  shouldOpenContentSeals,
} from "@/constants/contentSeal";

import { isDiaryContentSeal, type DiaryContentSeal } from "./diarySealDocument";

export const BUSINESS_SENSITIVE_FIELDS = {
  customerCreditRecords: [
    "customerName",
    "customerMobile",
    "customerAltContact",
    "customerAddress",
    "customerLocality",
    "customerCity",
    "customerState",
    "customerPin",
    "customerEmail",
    "documentReference",
    "products",
    "payments",
    "financerName",
    "financeRefNumber",
    "guarantorName",
    "remarks",
  ],
  purchaseOrders: [
    "vendorName",
    "vendorGstin",
    "vendorAddress",
    "vendorPin",
    "vendorState",
    "vendorContactName",
    "vendorContactPhone",
    "vendorContactEmail",
    "buyerName",
    "buyerAddress",
    "buyerGstin",
    "buyerPin",
    "buyerState",
    "authorizedBy",
    "authorizedDesignation",
    "shipName",
    "shipAddress",
    "shipPin",
    "shipState",
    "shipContact",
    "items",
    "notes",
  ],
  professionalPacks: ["title", "professionalName", "professionalContact", "notes", "facts"],
  letterheadDocs: ["title", "input"],
  users: [
    "displayName",
    "salutation",
    "businessName",
    "workType",
    "designation",
    "profileLogo",
    "pinCode",
    "pinLocality",
    "pinDistrict",
    "pinState",
    "gstin",
  ],
} as const;

export type BusinessSealCollection = keyof typeof BUSINESS_SENSITIVE_FIELDS;

const PURPOSE = {
  customerCreditRecords: "customer_credit",
  purchaseOrders: "purchase_order",
  professionalPacks: "professional_pack",
  letterheadDocs: "letterhead_document",
  users: "profile",
} as const;

const TITLE_PLACEHOLDER = new Set<BusinessSealCollection>(["professionalPacks", "letterheadDocs"]);

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeUtf8Base64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function pickSensitive(collection: BusinessSealCollection, record: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of BUSINESS_SENSITIVE_FIELDS[collection]) {
    if (key in record) out[key] = record[key];
  }
  return out;
}

export function sealedBusinessCloud(input: {
  collection: BusinessSealCollection;
  plain: Record<string, unknown>;
  seal: DiaryContentSeal;
}): Record<string, unknown> {
  const cloud: Record<string, unknown> = { ...input.plain, contentSeal: input.seal };
  for (const key of BUSINESS_SENSITIVE_FIELDS[input.collection]) {
    cloud[key] = TITLE_PLACEHOLDER.has(input.collection) && key === "title" ? "sealed" : null;
  }
  return cloud;
}

export async function protectBusinessCloud(input: {
  collection: BusinessSealCollection;
  userId: string;
  recordId: string;
  revision: number;
  plain: Record<string, unknown>;
  sensitiveSource?: Record<string, unknown>;
  existingRaw?: Record<string, unknown> | null;
}): Promise<Record<string, unknown>> {
  const backend = getActiveBackend();
  const existingSeal = isDiaryContentSeal(input.existingRaw?.contentSeal);
  if (existingSeal && !shouldCreateContentSeals(backend)) {
    throw new AppError(
      "save_failed",
      "This edit is held while new protection is paused.",
      undefined,
      { reason: "sealed_edit_held" }
    );
  }
  if (!shouldCreateContentSeals(backend)) return input.plain;
  const { callSealOwnerContent } = await import("@/services/auth/identityCallable");
  const seal = await callSealOwnerContent({
    collection: input.collection,
    recordId: input.recordId,
    revision: input.revision,
    purpose: PURPOSE[input.collection],
    plaintextBase64: encodeUtf8Base64(
      JSON.stringify(pickSensitive(input.collection, input.sensitiveSource ?? input.plain))
    ),
  });
  return sealedBusinessCloud({ collection: input.collection, plain: input.plain, seal });
}

export async function openBusinessCloud<T extends object>(
  collection: BusinessSealCollection,
  record: T,
  raw: Record<string, unknown>
): Promise<T> {
  if (!isDiaryContentSeal(raw.contentSeal) || !shouldOpenContentSeals(getActiveBackend())) {
    return record;
  }
  const seal = raw.contentSeal;
  const { callOpenOwnerContent } = await import("@/services/auth/identityCallable");
  const opened = await callOpenOwnerContent({
    collection,
    recordId: seal.recordId,
    revision: seal.revision,
    purpose: PURPOSE[collection],
    seal,
  });
  const fields = JSON.parse(decodeUtf8Base64(opened.plaintextBase64)) as Record<string, unknown>;
  return { ...record, ...fields } as T;
}

export async function settleCreatedBusinessCloud<T extends object>(input: {
  collection: BusinessSealCollection;
  userId: string;
  record: T;
  readRaw: () => Promise<Record<string, unknown> | null>;
  writeCloud: (cloud: Record<string, unknown>) => Promise<void>;
}): Promise<T> {
  const raw = await input.readRaw();
  if (raw && isDiaryContentSeal(raw.contentSeal)) {
    return openBusinessCloud(input.collection, input.record, raw);
  }
  if (!shouldCreateContentSeals(getActiveBackend())) return input.record;
  const source = input.record as { id?: string; updatedAt?: number };
  const cloud = await protectBusinessCloud({
    collection: input.collection,
    userId: input.userId,
    recordId: String(source.id ?? ""),
    revision: Number(source.updatedAt),
    plain: input.record as unknown as Record<string, unknown>,
    existingRaw: raw,
  });
  await input.writeCloud(cloud);
  return input.record;
}
