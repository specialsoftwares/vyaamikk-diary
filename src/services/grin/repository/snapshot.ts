import type { RegisterGoodsReceiptBody } from "@/goodsEvidence/command";
import { GOODS_EVIDENCE_SCHEMA_VERSION } from "@/goodsEvidence/constants";
import { cloneSnapshot } from "@/goodsEvidence/snapshot";
import type { ImmutableGrin } from "@/goodsEvidence/types";
import type { GrinLocalReceiptView } from "@/services/grin/outbox/types";

import type { GrinApplicationListItem, GrinApplicationRecord } from "./types";
import { GRIN_APPLICATION_REPOSITORY_KIND } from "./labels";

function asOptionalName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as { kind?: unknown; value?: unknown };
  if (rec.kind === "present" && typeof rec.value === "string" && rec.value.trim()) {
    return rec.value.trim();
  }
  return null;
}

export function parseRegisterBody(raw: unknown): RegisterGoodsReceiptBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Partial<RegisterGoodsReceiptBody>;
  if (typeof rec.receiptId !== "string" || !rec.receiptId) return null;
  if (typeof rec.series !== "string") return null;
  if (!rec.supplier || !rec.buyer || !Array.isArray(rec.lines)) return null;
  if (!rec.custody || !rec.captureProvenance || !rec.reportedArrivalAt) return null;
  return cloneSnapshot(rec as RegisterGoodsReceiptBody);
}

export function supplierNameFromBody(body: RegisterGoodsReceiptBody, fallback: string): string {
  return asOptionalName(body.supplier?.name) ?? fallback;
}

export function snapshotFromQueued(input: {
  ownerUid: string;
  ledgerId: string;
  body: RegisterGoodsReceiptBody;
  issuedNumber: string | null;
  serverRegisteredAtUtc: string | null;
}): ImmutableGrin {
  const body = cloneSnapshot(input.body);
  return {
    schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
    receiptId: body.receiptId,
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    series: body.series,
    serial: null,
    issuedNumber: input.issuedNumber,
    fyToken: null,
    buyer: body.buyer,
    supplier: body.supplier,
    commercial: body.commercial,
    ewb: body.ewb,
    transport: body.transport,
    lines: body.lines,
    custody: body.custody,
    receivingEmployeeAttributed: body.receivingEmployeeAttributed,
    qualityCheckedByAttributed: body.qualityCheckedByAttributed,
    remarks: body.remarks,
    acknowledgement: body.acknowledgement,
    warehouse: body.warehouse,
    locationBin: body.locationBin,
    captureProvenance: body.captureProvenance,
    capturedAtClientUtc: body.capturedAtClientUtc,
    reportedArrivalAt: body.reportedArrivalAt,
    reportedArrivalTimeZone: body.reportedArrivalTimeZone,
    serverRegisteredAtUtc: input.serverRegisteredAtUtc,
    originalSnapshotHash: null,
  };
}

export function gateRefusalOf(body: RegisterGoodsReceiptBody): GrinApplicationListItem["gateRefusal"] {
  return body.custody === "refused_at_gate" ? "refused_at_gate" : "none";
}

export function incompleteListItem(view: GrinLocalReceiptView): GrinApplicationListItem {
  return {
    receiptId: view.receiptId,
    displayNumber: view.issuedNumber,
    supplierName: null,
    localState: view.localState,
    custody: null,
    qcStatus: null,
    captureProvenance: null,
    reportedArrivalAt: null,
    serverRegisteredAtUtc: view.serverRegisteredAtUtc,
    offlinePending: view.localState !== "issued" || view.issuedNumber == null,
    gateRefusal: "unknown_incomplete",
    projection: "unknown_incomplete",
  };
}

export function toApplicationRecord(
  view: GrinLocalReceiptView,
  body: RegisterGoodsReceiptBody
): GrinApplicationRecord {
  const aligned: RegisterGoodsReceiptBody = { ...body, receiptId: view.receiptId };
  const snapshot = snapshotFromQueued({
    ownerUid: view.ownerUid,
    ledgerId: view.ledgerId,
    body: aligned,
    issuedNumber: view.issuedNumber,
    serverRegisteredAtUtc: view.serverRegisteredAtUtc,
  });
  return {
    repositoryKind: GRIN_APPLICATION_REPOSITORY_KIND,
    receiptId: view.receiptId,
    ownerUid: view.ownerUid,
    ledgerId: view.ledgerId,
    localState: view.localState,
    issuedNumber: view.issuedNumber,
    serverRegisteredAtUtc: view.serverRegisteredAtUtc,
    commandId: view.commandId,
    digest: view.digest,
    outbox: cloneSnapshot(view),
    body: aligned,
    original: snapshot,
    effective: cloneSnapshot(snapshot),
    gateRefusal: gateRefusalOf(aligned),
    projection: "readable",
  };
}

export function toListItem(record: GrinApplicationRecord): GrinApplicationListItem {
  return {
    receiptId: record.receiptId,
    displayNumber: record.issuedNumber,
    supplierName: supplierNameFromBody(record.body, "") || null,
    localState: record.localState,
    custody: record.effective.custody,
    qcStatus: record.effective.lines[0]?.qcStatus ?? null,
    captureProvenance: record.effective.captureProvenance,
    reportedArrivalAt: record.effective.reportedArrivalAt,
    serverRegisteredAtUtc: record.serverRegisteredAtUtc,
    offlinePending: record.localState !== "issued" || record.issuedNumber == null,
    gateRefusal: record.gateRefusal,
    projection: "readable",
  };
}
