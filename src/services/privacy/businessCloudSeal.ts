/**
 * Production cloud protection for the remaining business records.
 * Operational fields (ids, status, dates, serials, amounts, quota) stay readable.
 * Shared-dev and local-mock stay plaintext.
 */

import { AppError } from "@/domain/errors";
import { currentAuthMutationGeneration } from "@/services/auth/authSessionFence";
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
    "closure",
    "charges",
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
  professionalPacks: ["title", "professionalName", "professionalContact", "notes", "facts", "attachments", "reminder"],
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

function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null && right == null) return true;
  if (typeof left !== "object" || typeof right !== "object" || left == null || right == null) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

/** True when the profile write changes a field that must stay inside the content seal. */
export function userProfileWriteNeedsSeal(
  existing: Record<string, unknown>,
  next: Record<string, unknown>
): boolean {
  for (const key of BUSINESS_SENSITIVE_FIELDS.users) {
    if (!jsonEqual(existing[key], next[key])) return true;
  }
  return false;
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
  const generation = currentAuthMutationGeneration();
  const { callSealOwnerContent } = await import("@/services/auth/identityCallable");
  if (generation !== currentAuthMutationGeneration()) throw new Error("session_changed");
  const seal = await callSealOwnerContent({
    collection: input.collection,
    recordId: input.recordId,
    revision: input.revision,
    purpose: PURPOSE[input.collection],
    plaintextBase64: encodeUtf8Base64(
      JSON.stringify(pickSensitive(input.collection, input.sensitiveSource ?? input.plain))
    ),
  });
  if (generation !== currentAuthMutationGeneration()) throw new Error("session_changed");
  if (seal.uid !== input.userId || seal.recordId !== input.recordId || seal.revision !== input.revision ||
      seal.collection !== input.collection || seal.purpose !== PURPOSE[input.collection]) throw new Error("seal_binding_mismatch");
  return sealedBusinessCloud({ collection: input.collection, plain: input.plain, seal });
}

export async function openBusinessCloud<T extends object>(
  collection: BusinessSealCollection,
  record: T,
  raw: Record<string, unknown>
): Promise<T> {
  if (raw.contentSeal != null && !isDiaryContentSeal(raw.contentSeal)) throw new Error("unsupported_seal");
  if (!isDiaryContentSeal(raw.contentSeal) || !shouldOpenContentSeals(getActiveBackend())) {
    return record;
  }
  const seal = raw.contentSeal;
  assertBusinessSealBinding(collection, record, seal);
  const generation = currentAuthMutationGeneration();
  const { callOpenOwnerContent } = await import("@/services/auth/identityCallable");
  if (generation !== currentAuthMutationGeneration()) throw new Error("session_changed");
  const opened = await callOpenOwnerContent({
    collection,
    recordId: seal.recordId,
    revision: seal.revision,
    purpose: PURPOSE[collection],
    seal,
  });
  if (generation !== currentAuthMutationGeneration()) throw new Error("session_changed");
  const fields = JSON.parse(decodeUtf8Base64(opened.plaintextBase64)) as Record<string, unknown>;
  return { ...record, ...pickSensitive(collection, fields) } as T;
}

export function assertBusinessSealBinding(
  collection: BusinessSealCollection,
  record: object,
  seal: DiaryContentSeal
): void {
  const owner = record as { id?: string; uid?: string; userId?: string; updatedAt?: number };
  const expectedUid = owner.userId ?? owner.uid;
  const expectedId = collection === "users" ? owner.uid : owner.id;
  // Server identity/age/session updates also advance users.updatedAt without
  // changing profile content. Its authenticated seal revision is independent.
  if (!expectedUid || seal.uid !== expectedUid || seal.recordId !== expectedId ||
      (collection !== "users" && seal.revision !== owner.updatedAt) ||
      seal.collection !== collection || seal.purpose !== PURPOSE[collection]) {
    throw new Error("seal_binding_mismatch");
  }
}

/** Encrypt before the atomic record/counter/quota write; never write then seal. */
export function prepareBusinessCreate(collection: BusinessSealCollection, userId: string) {
  const generation = currentAuthMutationGeneration();
  const assertCurrent = () => {
    if (generation !== currentAuthMutationGeneration()) throw new Error("session_changed");
  };
  return async (plain: Record<string, unknown>) => {
    assertCurrent();
    const cloud = await protectBusinessCloud({
      collection, userId, recordId: String(plain.id), revision: Number(plain.updatedAt), plain,
    });
    assertCurrent();
    return (payload: Record<string, unknown>) => {
      assertCurrent();
      if (!isDiaryContentSeal(cloud.contentSeal)) return payload;
      if (cloud.contentSeal.uid !== userId || cloud.contentSeal.recordId !== payload.id ||
          cloud.contentSeal.revision !== payload.updatedAt) throw new Error("seal_binding_mismatch");
      return sealedBusinessCloud({ collection, plain: payload, seal: cloud.contentSeal });
    };
  };
}

export async function settleCreatedBusinessCloud<T extends object>(input: {
  collection: BusinessSealCollection;
  userId: string;
  record: T;
  readRaw: () => Promise<Record<string, unknown> | null>;
  writeCloud: (cloud: Record<string, unknown>) => Promise<void>;
}): Promise<T> {
  const raw = await input.readRaw();
  if (raw?.contentSeal != null) {
    return openBusinessCloud(input.collection, input.record, raw);
  }
  // Legacy replay is read-only. New creates were protected before their atomic
  // commit. Never perform a second unversioned write over a concurrent edit.
  return input.record;
}
