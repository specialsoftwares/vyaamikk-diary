/**
 * WAVE-1 LABELLED FAKE. Not a production GRIN adapter.
 * Team 5: grep `GrinFixtureRepository` — replace this in Wave 2.
 */

import { assembleManifest, mayMarkComplete } from "@/goodsEvidence/evidencePack";
import {
  appendMovementEvent,
  appendPortalObservation,
  emptyEwbHistories,
} from "@/goodsEvidence/ewb";
import { evaluateAllExceptionRules } from "@/goodsEvidence/exceptions";
import {
  applyReturnDispatch,
  compareDecimal,
  emptyLedgers,
  quantity,
} from "@/goodsEvidence/quantities";
import { cloneSnapshot } from "@/goodsEvidence/snapshot";
import { GOODS_EVIDENCE_SCHEMA_VERSION } from "@/goodsEvidence/constants";
import type { RegisterGoodsReceiptBody } from "@/goodsEvidence/command";
import type { OptionalText } from "@/goodsEvidence/types";

import { appendFixtureEvent } from "./events";
import {
  GRIN_FIXTURE_LEDGER_ID,
  GRIN_FIXTURE_OWNER_UID,
  GRIN_FIXTURE_REPOSITORY_LABEL,
  GRIN_PRICING_QUOTA_BLOCKER,
} from "./labels";
import { seedGrinFixtureRecords } from "./seed";
import type {
  GrinAmendInput,
  GrinCreateInput,
  GrinEwbPortalInput,
  GrinExceptionView,
  GrinFixtureRecord,
  GrinListItem,
  GrinPackExport,
  GrinQcInput,
  GrinReturnInput,
} from "./types";

export class GrinFixtureRepository {
  static readonly label = GRIN_FIXTURE_REPOSITORY_LABEL;
  static readonly wave = "wave1-labelled-fakes";
  static readonly pricingQuotaBlocker = GRIN_PRICING_QUOTA_BLOCKER;

  private readonly records = new Map<string, GrinFixtureRecord>();
  private createSeq = 100;

  constructor(seed: GrinFixtureRecord[] = seedGrinFixtureRecords()) {
    for (const record of seed) {
      this.records.set(record.receiptId, cloneSnapshot(record));
    }
  }

  static seeded(): GrinFixtureRepository {
    return new GrinFixtureRepository();
  }

  list(): GrinListItem[] {
    return [...this.records.values()]
      .map((record) => this.toListItem(record))
      .sort((a, b) => b.receiptId.localeCompare(a.receiptId));
  }

  get(receiptId: string): GrinFixtureRecord | null {
    const record = this.records.get(receiptId);
    return record ? cloneSnapshot(record) : null;
  }

  createQueued(input: GrinCreateInput): GrinFixtureRecord {
    const receiptId = input.receiptId.trim() || `fixture-created-${this.createSeq++}`;
    const original = {
      schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
      receiptId,
      ownerUid: GRIN_FIXTURE_OWNER_UID,
      ledgerId: GRIN_FIXTURE_LEDGER_ID,
      series: input.series || "MAIN",
      serial: null,
      issuedNumber: null,
      fyToken: null,
      buyer: cloneSnapshot(input.buyer),
      supplier: cloneSnapshot(input.supplier),
      commercial: cloneSnapshot(input.commercial),
      ewb: cloneSnapshot(input.ewb),
      transport: cloneSnapshot(input.transport),
      lines: cloneSnapshot(input.lines),
      custody: input.custody,
      receivingEmployeeAttributed: cloneSnapshot(input.receivingEmployeeAttributed),
      qualityCheckedByAttributed: cloneSnapshot(input.qualityCheckedByAttributed),
      remarks: cloneSnapshot(input.remarks),
      acknowledgement: cloneSnapshot(input.acknowledgement),
      warehouse: cloneSnapshot(input.warehouse),
      locationBin: cloneSnapshot(input.locationBin),
      captureProvenance: input.captureProvenance,
      capturedAtClientUtc: input.capturedAtClientUtc,
      reportedArrivalAt: input.reportedArrivalAt,
      reportedArrivalTimeZone: input.reportedArrivalTimeZone,
      serverRegisteredAtUtc: null,
      originalSnapshotHash: null,
    };
    const lineLedgers: GrinFixtureRecord["lineLedgers"] = {};
    for (const line of original.lines) {
      const ledgers = emptyLedgers(line.unit);
      ledgers.physicalReceived = { ...line.physicallyReceived };
      lineLedgers[line.lineId] = ledgers;
    }
    const record: GrinFixtureRecord = {
      fixtureKind: "GrinFixtureRecord",
      receiptId,
      localState: input.captureProvenance === "offline" ? "queued" : "draft",
      original,
      effective: cloneSnapshot(original),
      view: {
        schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
        receiptId,
        eventVersion: 0,
        headHash: "0".repeat(64),
        issuedNumber: null,
        custody: original.custody,
        qcStatus: null,
        voided: false,
        warnings: [],
      },
      events: [],
      ewbHistories: emptyEwbHistories(),
      lineLedgers,
      attachments: [],
      exceptionBundle: {
        evaluatedAtUtc: input.clientObservedAtUtc,
        observation: {
          observedAtUtc: input.clientObservedAtUtc,
          source: "GrinFixtureRepository createQueued — not a live GST feed",
          sourceKind: "manual_assertion",
        },
        ewbPresent: input.ewb.kind === "present",
        invoiceLinked: input.commercial.supplierInvoiceNumber.kind === "present",
        bookEntryPresent: false,
        ewbApplicability: "unknown",
        ewbLinked: input.ewb.kind === "present",
        inwardEwbPresent: input.ewb.kind === "present",
        grinPresent: false,
        challanLinked: input.commercial.challanNumber.kind === "present",
        ewbCancelled: false,
        cancellationEvidence: null,
        partyMatch: "unknown",
        amountMatch: "unknown",
        isGoodsPurchase: true,
        isServiceOrIsd: false,
        hasDirectDeliveryEvidence: false,
        importCoverage: "none",
        appearsIn2b: "unknown",
        isGstReportedGoodsPurchase: true,
        grinOrInvoicePresent: input.commercial.supplierInvoiceNumber.kind === "present",
        supplierStatus: "unknown",
        returnRecorded: false,
        returnEwbPresent: false,
        creditNotePresent: false,
        returnDocumentCoverage: "none",
      },
      packSpec: {
        purchaseCaseId: `case-${receiptId}`,
        verifiedOriginals: [],
        artifactHashes: {},
        missingOrUnverifiable: ["missing original — fixture create has not retained bytes"],
        inventoryDispositions: [],
        evidenceLinks: {},
      },
      gateRefusal: original.custody === "refused_at_gate" ? "refused_at_gate" : "none",
    };
    this.records.set(receiptId, record);
    return cloneSnapshot(record);
  }

  amend(input: GrinAmendInput): { ok: true; record: GrinFixtureRecord } | { ok: false; userMessageKey: "grin.errAmendReason" | "grin.notFound" } {
    const record = this.records.get(input.receiptId);
    if (!record) return { ok: false, userMessageKey: "grin.notFound" };
    if (!input.reason.trim()) return { ok: false, userMessageKey: "grin.errAmendReason" };
    const previousOriginal = cloneSnapshot(record.original);
    const next = cloneSnapshot(record);
    for (const [key, value] of Object.entries(input.changes)) {
      (next.effective as unknown as Record<string, unknown>)[key] = cloneSnapshot(value);
    }
    const event = appendFixtureEvent(next.events, {
      eventId: `fixture-evt-amend-${Date.now()}`,
      receiptId: next.receiptId,
      type: "field_amended",
      actorUid: GRIN_FIXTURE_OWNER_UID,
      serverAcceptedAtUtc: new Date().toISOString(),
      clientObservedAtUtc: new Date().toISOString(),
      reason: input.reason.trim(),
      typedChanges: {
        oldValues: Object.fromEntries(
          Object.keys(input.changes).map((key) => [
            key,
            cloneSnapshot((record.effective as unknown as Record<string, unknown>)[key] ?? null),
          ])
        ),
        newValues: cloneSnapshot(input.changes),
      },
    });
    next.view.eventVersion = event.streamSequence;
    next.view.headHash = event.eventHash;
    next.original = previousOriginal;
    this.records.set(next.receiptId, next);
    return { ok: true, record: cloneSnapshot(next) };
  }

  recordQc(input: GrinQcInput): { ok: true; record: GrinFixtureRecord } | { ok: false; userMessageKey: "grin.errQcReason" | "grin.notFound" } {
    const record = this.records.get(input.receiptId);
    if (!record) return { ok: false, userMessageKey: "grin.notFound" };
    if (!input.reason.trim()) return { ok: false, userMessageKey: "grin.errQcReason" };
    const next = cloneSnapshot(record);
    const previousQc = next.view.qcStatus;
    const event = appendFixtureEvent(next.events, {
      eventId: `fixture-evt-qc-${Date.now()}`,
      receiptId: next.receiptId,
      type: previousQc == null ? "qc_decision" : "qc_reclassified",
      actorUid: GRIN_FIXTURE_OWNER_UID,
      serverAcceptedAtUtc: new Date().toISOString(),
      clientObservedAtUtc: new Date().toISOString(),
      reason: input.reason.trim(),
      typedChanges: { oldQc: previousQc, newQc: input.qcStatus },
    });
    next.view.qcStatus = input.qcStatus;
    next.view.eventVersion = event.streamSequence;
    next.view.headHash = event.eventHash;
    if (input.qcStatus === "rejected" && next.original.custody === "received") {
      next.gateRefusal = "received_then_rejected";
    }
    this.records.set(next.receiptId, next);
    return { ok: true, record: cloneSnapshot(next) };
  }

  dispatchReturn(
    input: GrinReturnInput
  ): { ok: true; record: GrinFixtureRecord } | { ok: false; userMessageKey: "grin.errReturn" | "grin.notFound" | "grin.errReturnReason" } {
    const record = this.records.get(input.receiptId);
    if (!record) return { ok: false, userMessageKey: "grin.notFound" };
    if (!input.reason.trim()) return { ok: false, userMessageKey: "grin.errReturnReason" };
    const next = cloneSnapshot(record);
    const ledger = next.lineLedgers[input.lineId];
    if (!ledger) return { ok: false, userMessageKey: "grin.errReturn" };
    if (input.returnQtyUnit !== ledger.physicalReceived.unit) {
      return { ok: false, userMessageKey: "grin.errReturn" };
    }
    try {
      const returnQty = quantity(input.returnQtyValue, input.returnQtyUnit);
      const physicalBefore = ledger.physicalReceived.value;
      next.lineLedgers[input.lineId] = applyReturnDispatch(ledger, returnQty);
      const event = appendFixtureEvent(next.events, {
        eventId: `fixture-evt-return-${Date.now()}`,
        receiptId: next.receiptId,
        type: "return_dispatched",
        actorUid: GRIN_FIXTURE_OWNER_UID,
        serverAcceptedAtUtc: new Date().toISOString(),
        clientObservedAtUtc: new Date().toISOString(),
        reason: input.reason.trim(),
        typedChanges: {
          lineId: input.lineId,
          unit: returnQty.unit,
          returnQty,
          physicalReceivedUnchanged: next.lineLedgers[input.lineId]!.physicalReceived.value === physicalBefore,
        },
      });
      next.view.eventVersion = event.streamSequence;
      next.view.headHash = event.eventHash;
      const remaining = Object.values(next.lineLedgers).some(
        (line) => compareDecimal(line.physicalReceived.value, line.dispatchedReturn.value) > 0
      );
      const anyReturn = Object.values(next.lineLedgers).some(
        (line) => compareDecimal(line.dispatchedReturn.value, "0") > 0
      );
      if (anyReturn && remaining) next.view.custody = "partially_returned";
      if (anyReturn && !remaining) next.view.custody = "returned";
      next.exceptionBundle.returnRecorded = true;
      this.records.set(next.receiptId, next);
      return { ok: true, record: cloneSnapshot(next) };
    } catch {
      return { ok: false, userMessageKey: "grin.errReturn" };
    }
  }

  recordEwbPortal(
    input: GrinEwbPortalInput
  ): { ok: true; record: GrinFixtureRecord } | { ok: false; userMessageKey: "grin.notFound" | "grin.errEwb" } {
    const record = this.records.get(input.receiptId);
    if (!record) return { ok: false, userMessageKey: "grin.notFound" };
    const next = cloneSnapshot(record);
    const observation =
      input.status === "cancelled"
        ? {
            observedAtUtc: input.observedAtUtc,
            source: input.source,
            verificationLevel: input.verificationLevel,
            status: "cancelled" as const,
            evidence: input.evidence,
          }
        : {
            observedAtUtc: input.observedAtUtc,
            source: input.source,
            verificationLevel: input.verificationLevel,
            status: input.status,
          };
    const appended = appendPortalObservation(next.ewbHistories, observation);
    if (!appended.ok) return { ok: false, userMessageKey: "grin.errEwb" };
    next.ewbHistories = appended.histories;
    const event = appendFixtureEvent(next.events, {
      eventId: `fixture-evt-ewb-${Date.now()}`,
      receiptId: next.receiptId,
      type: "ewb_observation_recorded",
      actorUid: GRIN_FIXTURE_OWNER_UID,
      serverAcceptedAtUtc: input.observedAtUtc,
      clientObservedAtUtc: input.observedAtUtc,
      reason: "Portal observation recorded independently of movement and QC.",
      typedChanges: {
        portalStatus: appended.histories.portal[appended.histories.portal.length - 1]?.status,
        deliveryDoesNotCancelEwb: true,
        admission: appended.admission,
      },
    });
    next.view.eventVersion = event.streamSequence;
    next.view.headHash = event.eventHash;
    this.records.set(next.receiptId, next);
    return { ok: true, record: cloneSnapshot(next) };
  }

  recordArrivalDoesNotCancelEwb(receiptId: string, atUtc: string, reason: string): GrinFixtureRecord | null {
    const record = this.records.get(receiptId);
    if (!record) return null;
    const next = cloneSnapshot(record);
    next.ewbHistories = appendMovementEvent(next.ewbHistories, {
      atUtc,
      movement: "arrived_received",
      reason,
    });
    this.records.set(receiptId, next);
    return cloneSnapshot(next);
  }

  exportPack(receiptId: string): GrinPackExport | null {
    const record = this.records.get(receiptId);
    if (!record) return null;
    const spec = record.packSpec;
    const pinnedCuts =
      record.events.length > 0
        ? [
            {
              receiptId,
              eventVersion: record.events.length,
              headHash: record.events[record.events.length - 1]!.eventHash,
            },
          ]
        : [];
    const manifest = assembleManifest({
      exportId: `fixture-export-${receiptId}`,
      ownerUid: GRIN_FIXTURE_OWNER_UID,
      ledgerId: GRIN_FIXTURE_LEDGER_ID,
      purchaseCaseId: spec.purchaseCaseId,
      pinnedCuts,
      verifiedOriginals: spec.verifiedOriginals,
      artifactHashes: spec.artifactHashes,
      missingOrUnverifiable: spec.missingOrUnverifiable,
      eventStreams: [{ receiptId, events: record.events }],
      originalSnapshots: [record.original],
      inventoryDispositions: spec.inventoryDispositions,
      evidenceLinks: spec.evidenceLinks,
      templateVersion: "grin-fixture-pack-v1",
    });
    const complete = mayMarkComplete(manifest);
    const missingOriginal =
      spec.verifiedOriginals.length === 0 ||
      spec.missingOrUnverifiable.some((reason) => /missing original/i.test(reason)) ||
      manifest.incompleteReasons.some((reason) => /missing original|no verified originals/i.test(reason));
    const invoiceReferenceIsNotRetainedInvoice = record.attachments.some((item) => item.isInvoiceReferenceOnly);
    const challanIsNotInvoice = record.attachments.some((item) => item.isChallan);
    return {
      manifest,
      completenessLabel: complete ? "complete" : "incomplete",
      itcDisposition: "not_determined",
      invoiceReferenceIsNotRetainedInvoice,
      challanIsNotInvoice,
      missingOriginal,
    };
  }

  exceptions(receiptId: string): GrinExceptionView | null {
    const record = this.records.get(receiptId);
    if (!record) return null;
    return {
      evaluations: evaluateAllExceptionRules(record.exceptionBundle),
      itcAlwaysNotDetermined: true,
    };
  }

  private toListItem(record: GrinFixtureRecord): GrinListItem {
    const supplier = record.effective.supplier.name;
    return {
      receiptId: record.receiptId,
      displayNumber: record.effective.issuedNumber,
      supplierName: supplier.kind === "present" ? supplier.value : record.receiptId,
      localState: record.localState,
      custody: record.view.custody,
      qcStatus: record.view.qcStatus,
      captureProvenance: record.effective.captureProvenance,
      reportedArrivalAt: record.effective.reportedArrivalAt,
      serverRegisteredAtUtc: record.effective.serverRegisteredAtUtc,
      offlinePending: record.localState !== "issued" || record.effective.issuedNumber == null,
      gateRefusal: record.gateRefusal,
    };
  }
}

let shared: GrinFixtureRepository | null = null;

export function getGrinFixtureRepository(): GrinFixtureRepository {
  if (!shared) shared = GrinFixtureRepository.seeded();
  return shared;
}

export function resetGrinFixtureRepositoryForTests(): void {
  shared = null;
}

export function presentText(value: string): OptionalText {
  const trimmed = value.trim();
  return trimmed ? { kind: "present", value: trimmed } : { kind: "not_supplied" };
}

export function draftFromFormDefaults(): RegisterGoodsReceiptBody {
  return {
    receiptId: `fixture-created-${Date.now()}`,
    series: "MAIN",
    capturedAtClientUtc: new Date().toISOString(),
    reportedArrivalAt: new Date().toISOString(),
    reportedArrivalTimeZone: "Asia/Kolkata",
    captureProvenance: "offline",
    buyer: {
      legalName: "",
      gstin: { kind: "not_supplied" },
      address: { kind: "not_supplied" },
    },
    supplier: {
      name: { kind: "not_supplied" },
      registration: { kind: "not_supplied" },
      address: { kind: "not_supplied" },
      contact: { kind: "not_supplied" },
    },
    commercial: {
      supplierInvoiceNumber: { kind: "not_supplied" },
      supplierInvoiceDate: { kind: "not_supplied" },
      supplierInvoiceValue: null,
      purchaseOrderNumber: { kind: "not_supplied" },
      purchaseOrderInternalId: { kind: "not_supplied" },
      challanNumber: { kind: "not_supplied" },
      missingDocumentReason: { kind: "not_supplied" },
    },
    ewb: { kind: "unknown", reason: "Not recorded at capture." },
    transport: {
      vehicleNumber: { kind: "not_supplied" },
      transporterName: { kind: "not_supplied" },
      transporterId: { kind: "not_supplied" },
      lrNumber: { kind: "not_supplied" },
      mode: { kind: "not_supplied" },
    },
    lines: [
      {
        lineId: "line_1",
        description: "",
        hsn: { kind: "not_supplied" },
        invoiceLineRef: { kind: "not_supplied" },
        invoiceQuantity: null,
        expectedOnThisDelivery: quantity("0", "bags"),
        physicallyReceived: quantity("0", "bags"),
        unit: "bags",
        grossWeight: null,
        tareWeight: null,
        netWeight: null,
        weightUnit: { kind: "not_supplied" },
        packageCount: null,
        shortageOrExcess: "unknown",
        condition: { kind: "not_supplied" },
        qcStatus: null,
      },
    ],
    custody: "received",
    warehouse: { kind: "not_supplied" },
    locationBin: { kind: "not_supplied" },
    receivingEmployeeAttributed: { kind: "not_supplied" },
    qualityCheckedByAttributed: { kind: "not_supplied" },
    remarks: { kind: "not_supplied" },
    acknowledgement: {
      outcome: "not_requested",
      claimedRole: { kind: "not_supplied" },
      statement: "Driver acknowledgement not requested at capture.",
      explanation: { kind: "not_supplied" },
    },
    clientObservedAtUtc: new Date().toISOString(),
  };
}
