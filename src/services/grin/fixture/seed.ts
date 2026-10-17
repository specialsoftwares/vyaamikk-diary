import { GOODS_EVIDENCE_SCHEMA_VERSION } from "@/goodsEvidence/constants";
import { emptyEwbHistories, recordArrival, recordPortalCancellation, appendMovementEvent, appendQcEvent } from "@/goodsEvidence/ewb";
import type { OriginalEvidence } from "@/goodsEvidence/evidence";
import type { EvidenceItemDisposition, EvidenceLinkage } from "@/goodsEvidence/evidencePack";
import type { GrinExceptionBundle } from "@/goodsEvidence/exceptions";
import { emptyLedgers, quantity, applyReturnDispatch } from "@/goodsEvidence/quantities";
import { sampleRegisterBody, sampleLine } from "@/goodsEvidence/testFixtures";
import type { GrinEvent, GrinView, ImmutableGrin, ReceiptLine } from "@/goodsEvidence/types";
import type { EwbCancellationEvidence, EwbHistories } from "@/goodsEvidence/ewb";

import { appendFixtureEvent, sealOriginal } from "./events";
import { GRIN_FIXTURE_LEDGER_ID, GRIN_FIXTURE_OWNER_UID } from "./labels";
import type { GrinFixtureAttachment, GrinFixtureRecord, GrinPackFixtureSpec } from "./types";

const AT = "2026-09-28T06:00:00.000Z";
const ARRIVAL = "2026-09-28T05:30:00.000Z";
const HASH_INVOICE = "a1".repeat(32);
const HASH_UNLOAD = "c3".repeat(32);

const OBS = {
  observedAtUtc: "2026-09-28T12:00:00.000Z",
  source: "GrinFixtureRepository labelled manual assertion — not a live GST feed",
  sourceKind: "manual_assertion" as const,
};

function lineCotton(overrides: Partial<ReceiptLine> = {}): ReceiptLine {
  return sampleLine({
    description: "Cotton bales",
    hsn: { kind: "present", value: "5201" },
    invoiceQuantity: quantity("100", "bags"),
    expectedOnThisDelivery: quantity("40", "bags"),
    physicallyReceived: quantity("40", "bags"),
    unit: "bags",
    grossWeight: quantity("2000", "kg", 0),
    tareWeight: quantity("40", "kg", 0),
    netWeight: quantity("1960", "kg", 0),
    weightUnit: { kind: "present", value: "kg" },
    packageCount: quantity("40", "packages"),
    shortageOrExcess: "none",
    condition: { kind: "present", value: "sound" },
    ...overrides,
  });
}

function originalFrom(receiptId: string, issuedNumber: string | null, serial: number | null, rest: Partial<ImmutableGrin> = {}): ImmutableGrin {
  const body = sampleRegisterBody();
  const draft: Omit<ImmutableGrin, "originalSnapshotHash"> = {
    schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
    receiptId,
    ownerUid: GRIN_FIXTURE_OWNER_UID,
    ledgerId: GRIN_FIXTURE_LEDGER_ID,
    series: "MAIN",
    serial,
    issuedNumber,
    fyToken: issuedNumber ? "FY2026-27" : null,
    buyer: body.buyer,
    supplier: body.supplier,
    commercial: body.commercial,
    ewb: { kind: "none" },
    transport: body.transport,
    lines: [lineCotton()],
    custody: "received",
    receivingEmployeeAttributed: { kind: "present", value: "R. Patel (attributed — not a verified signature)" },
    qualityCheckedByAttributed: { kind: "not_supplied" },
    remarks: { kind: "not_supplied" },
    acknowledgement: body.acknowledgement,
    warehouse: { kind: "present", value: "Main godown" },
    locationBin: { kind: "present", value: "Bay A" },
    captureProvenance: "online",
    capturedAtClientUtc: AT,
    reportedArrivalAt: ARRIVAL,
    reportedArrivalTimeZone: "Asia/Kolkata",
    serverRegisteredAtUtc: issuedNumber ? AT : null,
    ...rest,
  };
  return issuedNumber ? sealOriginal(draft) : { ...draft, originalSnapshotHash: null };
}

function viewOf(original: ImmutableGrin, eventVersion: number, headHash: string, extra: Partial<GrinView> = {}): GrinView {
  return {
    schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
    receiptId: original.receiptId,
    eventVersion,
    headHash,
    issuedNumber: original.issuedNumber,
    custody: original.custody,
    qcStatus: null,
    voided: false,
    warnings: [],
    ...extra,
  };
}

function ledgersFrom(lines: ReceiptLine[], refusedAtGate: boolean): Record<string, ReturnType<typeof emptyLedgers>> {
  const out: Record<string, ReturnType<typeof emptyLedgers>> = {};
  for (const line of lines) {
    const ledgers = emptyLedgers(line.unit);
    ledgers.physicalReceived = { ...line.physicallyReceived };
    if (refusedAtGate) {
      ledgers.physicalReceived = { ...line.physicallyReceived };
    }
    out[line.lineId] = ledgers;
  }
  return out;
}

function baseExceptions(overrides: Partial<GrinExceptionBundle> = {}): GrinExceptionBundle {
  return {
    evaluatedAtUtc: OBS.observedAtUtc,
    observation: OBS,
    ewbPresent: false,
    invoiceLinked: true,
    bookEntryPresent: true,
    ewbApplicability: "unknown",
    ewbLinked: false,
    inwardEwbPresent: false,
    grinPresent: true,
    challanLinked: false,
    ewbCancelled: false,
    cancellationEvidence: null,
    partyMatch: true,
    amountMatch: true,
    grinParty: "Sample Supplier",
    otherParty: "Sample Supplier",
    grinAmountMinor: 118000,
    otherAmountMinor: 118000,
    isGoodsPurchase: true,
    isServiceOrIsd: false,
    hasDirectDeliveryEvidence: false,
    importCoverage: "full",
    appearsIn2b: true,
    isGstReportedGoodsPurchase: true,
    grinOrInvoicePresent: true,
    supplierStatus: "active",
    returnRecorded: false,
    returnEwbPresent: false,
    creditNotePresent: false,
    returnDocumentCoverage: "none",
    ...overrides,
  };
}

function originalEvidence(
  evidenceId: string,
  category: OriginalEvidence["category"],
  hash: string
): OriginalEvidence {
  return {
    evidenceId,
    category,
    originalFileName: `${evidenceId}.pdf`,
    mime: "application/pdf",
    byteSize: 1024,
    rawSha256: hash,
    storageObjectGeneration: "fixture-generation-1",
    captureProvenance: "GrinFixtureRepository — not Storage originals",
    osConversionOccurred: false,
    verification: "verified",
    isDerivative: false,
    labelledSupport: {
      inventoryItemIds: category === "invoice" ? ["commercial_document", "supplier_identity"] : [],
      facts: ["fixture-labelled-support"],
    },
  };
}

function completePackSpec(receiptId: string): GrinPackFixtureSpec {
  const invoice = originalEvidence(`fixture-ev-invoice-${receiptId}`, "invoice", HASH_INVOICE);
  const unload = originalEvidence(`fixture-ev-unload-${receiptId}`, "unloading", HASH_UNLOAD);
  const dispositions: EvidenceItemDisposition[] = [
    {
      itemId: "supplier_identity",
      kind: "satisfied_from_snapshot",
      snapshotReceiptId: receiptId,
      reason: "Supplier name and GSTIN are recorded on the issued GRIN snapshot.",
    },
    { itemId: "commercial_document", kind: "satisfied", evidenceId: invoice.evidenceId },
    {
      itemId: "movement_evidence",
      kind: "not_applicable",
      policyCode: "receipt_does_not_record_goods_movement",
      reason: "This fixture purchase did not record a goods-movement document.",
    },
    {
      itemId: "receipt_evidence",
      kind: "satisfied_from_snapshot",
      snapshotReceiptId: receiptId,
      reason: "Issued number, arrival, warehouse and received quantities are on the snapshot.",
    },
    {
      itemId: "accounting_payment_evidence",
      kind: "not_applicable",
      policyCode: "no_stock_or_payment_event_recorded_for_this_case",
      reason: "No stock or payment event is recorded for this fixture case.",
    },
    {
      itemId: "gst_evidence",
      kind: "not_applicable",
      policyCode: "not_a_gst_reported_goods_purchase",
      reason: "Fixture case is not asserted as a GST-reported goods purchase for pack coverage.",
    },
  ];
  const evidenceLinks: Record<string, EvidenceLinkage> = {
    [invoice.evidenceId]: {
      scope: "receipt",
      ownerUid: GRIN_FIXTURE_OWNER_UID,
      ledgerId: GRIN_FIXTURE_LEDGER_ID,
      purchaseCaseId: `case-${receiptId}`,
      receiptId,
    },
    [unload.evidenceId]: {
      scope: "receipt",
      ownerUid: GRIN_FIXTURE_OWNER_UID,
      ledgerId: GRIN_FIXTURE_LEDGER_ID,
      purchaseCaseId: `case-${receiptId}`,
      receiptId,
    },
  };
  return {
    purchaseCaseId: `case-${receiptId}`,
    verifiedOriginals: [invoice, unload],
    artifactHashes: { [invoice.evidenceId]: HASH_INVOICE, [unload.evidenceId]: HASH_UNLOAD },
    missingOrUnverifiable: [],
    inventoryDispositions: dispositions,
    evidenceLinks,
  };
}

function incompleteMissingOriginalSpec(receiptId: string): GrinPackFixtureSpec {
  return {
    purchaseCaseId: `case-${receiptId}`,
    verifiedOriginals: [],
    artifactHashes: {},
    missingOrUnverifiable: ["missing original invoice bytes"],
    inventoryDispositions: [
      {
        itemId: "supplier_identity",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: receiptId,
        reason: "Supplier identity asserted on snapshot only.",
      },
      {
        itemId: "commercial_document",
        kind: "missing",
        reason: "Missing original — invoice reference on the GRIN is not a retained invoice.",
      },
      {
        itemId: "movement_evidence",
        kind: "missing",
        reason: "No verified movement original.",
      },
      {
        itemId: "receipt_evidence",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: receiptId,
        reason: "Receipt facts are on the snapshot.",
      },
      {
        itemId: "accounting_payment_evidence",
        kind: "not_applicable",
        policyCode: "no_stock_or_payment_event_recorded_for_this_case",
        reason: "No stock or payment event recorded.",
      },
      {
        itemId: "gst_evidence",
        kind: "unknown",
        reason: "GST evidence source is incomplete.",
      },
    ],
    evidenceLinks: {},
  };
}

function invoiceReferenceOnlySpec(receiptId: string): GrinPackFixtureSpec {
  return {
    purchaseCaseId: `case-${receiptId}`,
    verifiedOriginals: [],
    artifactHashes: {},
    missingOrUnverifiable: [],
    inventoryDispositions: [
      {
        itemId: "supplier_identity",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: receiptId,
        reason: "Supplier identity on snapshot.",
      },
      {
        itemId: "commercial_document",
        kind: "missing",
        reason: "Invoice number on the GRIN is a reference, not a retained invoice original.",
      },
      {
        itemId: "movement_evidence",
        kind: "not_applicable",
        policyCode: "receipt_does_not_record_goods_movement",
        reason: "No movement recorded.",
      },
      {
        itemId: "receipt_evidence",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: receiptId,
        reason: "Receipt facts on snapshot.",
      },
      {
        itemId: "accounting_payment_evidence",
        kind: "not_applicable",
        policyCode: "no_stock_or_payment_event_recorded_for_this_case",
        reason: "No stock or payment event.",
      },
      {
        itemId: "gst_evidence",
        kind: "not_applicable",
        policyCode: "not_a_gst_reported_goods_purchase",
        reason: "Not asserted as GST-reported goods purchase.",
      },
    ],
    evidenceLinks: {},
  };
}

function challanNotInvoiceSpec(receiptId: string): GrinPackFixtureSpec {
  const challan: OriginalEvidence = {
    ...originalEvidence(`fixture-ev-challan-${receiptId}`, "invoice", HASH_INVOICE),
    category: "invoice",
    originalFileName: "challan.pdf",
    labelledSupport: {
      inventoryItemIds: [],
      facts: ["challan-file-must-not-satisfy-commercial-document-as-invoice"],
    },
  };
  return {
    purchaseCaseId: `case-${receiptId}`,
    verifiedOriginals: [],
    artifactHashes: {},
    missingOrUnverifiable: [],
    inventoryDispositions: [
      {
        itemId: "supplier_identity",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: receiptId,
        reason: "Supplier on snapshot.",
      },
      {
        itemId: "commercial_document",
        kind: "missing",
        reason: "A challan is not an invoice and does not retain an invoice original.",
      },
      {
        itemId: "movement_evidence",
        kind: "not_applicable",
        policyCode: "receipt_does_not_record_goods_movement",
        reason: "No movement recorded.",
      },
      {
        itemId: "receipt_evidence",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: receiptId,
        reason: "Receipt facts on snapshot.",
      },
      {
        itemId: "accounting_payment_evidence",
        kind: "not_applicable",
        policyCode: "no_stock_or_payment_event_recorded_for_this_case",
        reason: "No stock or payment event.",
      },
      {
        itemId: "gst_evidence",
        kind: "not_applicable",
        policyCode: "not_a_gst_reported_goods_purchase",
        reason: "Not asserted as GST-reported.",
      },
    ],
    evidenceLinks: {
      [challan.evidenceId]: {
        scope: "receipt",
        ownerUid: GRIN_FIXTURE_OWNER_UID,
        ledgerId: GRIN_FIXTURE_LEDGER_ID,
        purchaseCaseId: `case-${receiptId}`,
        receiptId,
      },
    },
  };
}

function attachment(
  evidenceId: string,
  displayName: string,
  verification: GrinFixtureAttachment["verification"],
  extra: Partial<GrinFixtureAttachment> = {}
): GrinFixtureAttachment {
  return {
    evidenceId,
    fixtureLabel: "GrinFixtureAttachment",
    category: extra.category ?? "invoice",
    displayName,
    verification,
    isDerivative: extra.isDerivative ?? false,
    isRetainedOriginal: extra.isRetainedOriginal ?? verification === "verified",
    isInvoiceReferenceOnly: extra.isInvoiceReferenceOnly ?? false,
    isChallan: extra.isChallan ?? false,
    completeness: verification === "verified" && !extra.isDerivative ? "complete" : "not_complete",
    ...extra,
  };
}

function registeredRecord(
  receiptId: string,
  issuedNumber: string,
  serial: number,
  options: {
    original?: Partial<ImmutableGrin>;
    histories?: EwbHistories;
    extraEvents?: (events: GrinEvent[]) => void;
    view?: Partial<GrinView>;
    attachments?: GrinFixtureAttachment[];
    exceptionBundle?: GrinExceptionBundle;
    packSpec?: GrinPackFixtureSpec;
    gateRefusal?: GrinFixtureRecord["gateRefusal"];
    localState?: GrinFixtureRecord["localState"];
    mutateLedgers?: (ledgers: Record<string, ReturnType<typeof emptyLedgers>>) => void;
  } = {}
): GrinFixtureRecord {
  const original = originalFrom(receiptId, issuedNumber, serial, options.original);
  const events = [
    appendFixtureEvent([], {
      eventId: `fixture-evt-${receiptId}-1`,
      receiptId,
      type: "receipt_registered",
      actorUid: GRIN_FIXTURE_OWNER_UID,
      serverAcceptedAtUtc: original.serverRegisteredAtUtc ?? AT,
      clientObservedAtUtc: original.capturedAtClientUtc,
      reason: "issued",
      typedChanges: {
        issuedNumber,
        serial,
        fyToken: original.fyToken,
        originalSnapshotHash: original.originalSnapshotHash,
      },
    }),
  ];
  // appendFixtureEvent already pushed into []... wait, I passed [] and it mutates. events[0] is the registered event.
  options.extraEvents?.(events);
  const head = events[events.length - 1]!;
  const lineLedgers = ledgersFrom(original.lines, original.custody === "refused_at_gate");
  options.mutateLedgers?.(lineLedgers);
  return {
    fixtureKind: "GrinFixtureRecord",
    receiptId,
    localState: options.localState ?? "issued",
    original,
    effective: { ...original },
    view: viewOf(original, events.length, head.eventHash, options.view),
    events,
    ewbHistories: options.histories ?? emptyEwbHistories(),
    lineLedgers,
    attachments: options.attachments ?? [
      attachment(`fixture-ev-invoice-${receiptId}`, "Supplier invoice (fixture original)", "verified", {
        isRetainedOriginal: true,
      }),
    ],
    exceptionBundle: options.exceptionBundle ?? baseExceptions(),
    packSpec: options.packSpec ?? completePackSpec(receiptId),
    gateRefusal: options.gateRefusal ?? "none",
  };
}

const cancelledEvidence: EwbCancellationEvidence = {
  reason: "Vehicle breakdown before dispatch",
  goodsMoved: "no",
  goodsMovedUnknownReason: null,
  linkedDocument: { kind: "invoice", reference: "INV-1" },
  party: "Sample Supplier",
  amount: { kind: "present", currency: "INR", minorUnits: 118000 },
  replacementEbn: { kind: "present", ebn: "181234567890" },
};

function ewbCancelledHistories(): EwbHistories {
  let histories = emptyEwbHistories();
  const cancelled = recordPortalCancellation(
    histories,
    {
      observedAtUtc: "2026-09-28T07:00:00.000Z",
      source: "GrinFixtureRepository imported portal copy — not a live EWB portal",
      verificationLevel: "imported_document",
    },
    cancelledEvidence
  );
  if (!cancelled.ok) throw new Error("fixture cancelled EWB evidence must admit");
  histories = cancelled.histories;
  histories = recordArrival(histories, "2026-09-28T08:00:00.000Z", "Goods arrived; delivery does not cancel the portal EWB.");
  histories = appendQcEvent(histories, {
    atUtc: "2026-09-28T08:30:00.000Z",
    qc: "accepted",
    reason: "QC accepted independently of portal cancellation.",
  });
  return histories;
}

function gateRefusedHistories(): EwbHistories {
  let histories = emptyEwbHistories();
  histories = appendMovementEvent(histories, {
    atUtc: "2026-09-28T05:45:00.000Z",
    movement: "gate_refused",
    reason: "Seal broken; refused at gate. Portal EWB remains independent.",
  });
  return histories;
}

export function seedGrinFixtureRecords(): GrinFixtureRecord[] {
  const offline = originalFrom("fixture-offline-pending", null, null, {
    captureProvenance: "offline",
    serverRegisteredAtUtc: null,
    issuedNumber: null,
    serial: null,
    fyToken: null,
  });

  const offlineRecord: GrinFixtureRecord = {
    fixtureKind: "GrinFixtureRecord",
    receiptId: "fixture-offline-pending",
    localState: "queued",
    original: offline,
    effective: { ...offline },
    view: viewOf(offline, 0, "0".repeat(64), { issuedNumber: null, eventVersion: 0 }),
    events: [],
    ewbHistories: emptyEwbHistories(),
    lineLedgers: ledgersFrom(offline.lines, false),
    attachments: [
      attachment("fixture-ev-offline-photo", "Gate photo (unverified fixture)", "pending", {
        category: "vehicle",
        isRetainedOriginal: false,
      }),
    ],
    exceptionBundle: baseExceptions({
      grinPresent: false,
      invoiceLinked: true,
      importCoverage: "partial",
      observation: {
        observedAtUtc: AT,
        source: "",
        sourceKind: "unknown_incomplete",
      },
    }),
    packSpec: incompleteMissingOriginalSpec("fixture-offline-pending"),
    gateRefusal: "none",
  };

  const issued = registeredRecord("fixture-online-issued", "GRIN/MAIN/FY2026-27/000001", 1, {
    packSpec: completePackSpec("fixture-online-issued"),
  });

  const gate = registeredRecord("fixture-gate-refused", "GRIN/MAIN/FY2026-27/000002", 2, {
    original: { custody: "refused_at_gate" },
    histories: gateRefusedHistories(),
    view: { custody: "refused_at_gate" },
    gateRefusal: "refused_at_gate",
    exceptionBundle: baseExceptions({ ewbPresent: false, grinPresent: true }),
  });

  const receivedRejected = registeredRecord(
    "fixture-received-then-rejected",
    "GRIN/MAIN/FY2026-27/000003",
    3,
    {
      original: { custody: "received" },
      view: { qcStatus: "rejected", custody: "received" },
      gateRefusal: "received_then_rejected",
      extraEvents: (events) => {
        appendFixtureEvent(events, {
          eventId: "fixture-evt-received-then-rejected-qc",
          receiptId: "fixture-received-then-rejected",
          type: "qc_decision",
          actorUid: GRIN_FIXTURE_OWNER_UID,
          serverAcceptedAtUtc: "2026-09-28T09:00:00.000Z",
          clientObservedAtUtc: "2026-09-28T09:00:00.000Z",
          reason: "Water damage found after unloading — received then rejected, not gate refusal.",
          typedChanges: { oldQc: null, newQc: "rejected" },
        });
      },
    }
  );

  const partial = registeredRecord("fixture-partial-return", "GRIN/MAIN/FY2026-27/000004", 4, {
    view: { custody: "partially_returned" },
    extraEvents: (events) => {
      appendFixtureEvent(events, {
        eventId: "fixture-evt-partial-return",
        receiptId: "fixture-partial-return",
        type: "return_dispatched",
        actorUid: GRIN_FIXTURE_OWNER_UID,
        serverAcceptedAtUtc: "2026-09-28T10:00:00.000Z",
        clientObservedAtUtc: "2026-09-28T10:00:00.000Z",
        reason: "Short-landed bags returned. Weight kg and package counts are tracked separately.",
        typedChanges: {
          lineId: "line_1",
          unit: "bags",
          returnQty: quantity("10", "bags"),
          physicalReceivedUnchanged: true,
        },
      });
    },
    mutateLedgers: (ledgers) => {
      ledgers.line_1 = applyReturnDispatch(ledgers.line_1!, quantity("10", "bags"));
    },
    exceptionBundle: baseExceptions({
      returnRecorded: true,
      returnEwbPresent: false,
      creditNotePresent: false,
      returnDocumentCoverage: "full",
    }),
  });

  const full = registeredRecord("fixture-full-return", "GRIN/MAIN/FY2026-27/000005", 5, {
    view: { custody: "returned" },
    extraEvents: (events) => {
      appendFixtureEvent(events, {
        eventId: "fixture-evt-full-return",
        receiptId: "fixture-full-return",
        type: "return_dispatched",
        actorUid: GRIN_FIXTURE_OWNER_UID,
        serverAcceptedAtUtc: "2026-09-28T11:00:00.000Z",
        clientObservedAtUtc: "2026-09-28T11:00:00.000Z",
        reason: "Full material quantity returned in bags. Not a weight return.",
        typedChanges: {
          lineId: "line_1",
          unit: "bags",
          returnQty: quantity("40", "bags"),
          physicalReceivedUnchanged: true,
        },
      });
    },
    mutateLedgers: (ledgers) => {
      ledgers.line_1 = applyReturnDispatch(ledgers.line_1!, quantity("40", "bags"));
    },
    exceptionBundle: baseExceptions({
      returnRecorded: true,
      returnEwbPresent: true,
      creditNotePresent: true,
      returnDocumentCoverage: "full",
    }),
  });

  const ewbCancelled = registeredRecord("fixture-ewb-cancelled-complete", "GRIN/MAIN/FY2026-27/000006", 6, {
    original: {
      ewb: {
        kind: "present",
        ebn: "181000000001",
        generatedBy: "supplier",
        generatingIdentity: "29BBBBB0000B1Z5",
        sourceGeneratedAt: "2026-09-27T02:00:00.000Z",
        sourceValidUntil: "2026-09-28T02:00:00.000Z",
      },
    },
    histories: ewbCancelledHistories(),
    extraEvents: (events) => {
      appendFixtureEvent(events, {
        eventId: "fixture-evt-ewb-cancel",
        receiptId: "fixture-ewb-cancelled-complete",
        type: "ewb_observation_recorded",
        actorUid: GRIN_FIXTURE_OWNER_UID,
        serverAcceptedAtUtc: "2026-09-28T07:00:00.000Z",
        clientObservedAtUtc: "2026-09-28T07:00:00.000Z",
        reason: "Portal cancellation recorded independently of arrival.",
        typedChanges: { portalStatus: "cancelled", deliveryDoesNotCancelEwb: true },
      });
    },
    exceptionBundle: baseExceptions({
      ewbPresent: true,
      ewbLinked: true,
      ewbApplicability: "required",
      ewbCancelled: true,
      cancellationEvidence: cancelledEvidence,
      inwardEwbPresent: true,
    }),
  });

  const ewbUnknown = registeredRecord("fixture-ewb-unknown", "GRIN/MAIN/FY2026-27/000007", 7, {
    original: { ewb: { kind: "unknown", reason: "Driver did not carry an EWB copy; unknown is explicit." } },
    exceptionBundle: baseExceptions({
      ewbPresent: false,
      ewbApplicability: "unknown",
      ewbLinked: false,
    }),
  });

  const amended = registeredRecord("fixture-amended-history", "GRIN/MAIN/FY2026-27/000008", 8, {
    extraEvents: (events) => {
      appendFixtureEvent(events, {
        eventId: "fixture-evt-amend-1",
        receiptId: "fixture-amended-history",
        type: "field_amended",
        actorUid: GRIN_FIXTURE_OWNER_UID,
        serverAcceptedAtUtc: "2026-09-28T13:00:00.000Z",
        clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
        reason: "Warehouse bin restated after put-away. Original issued snapshot is unchanged.",
        typedChanges: {
          oldValues: { locationBin: { kind: "present", value: "Bay A" } },
          newValues: { locationBin: { kind: "present", value: "Bay B" } },
        },
      });
    },
  });
  amended.effective = {
    ...amended.effective,
    locationBin: { kind: "present", value: "Bay B" },
  };

  const incompletePack = registeredRecord(
    "fixture-incomplete-pack-missing-original",
    "GRIN/MAIN/FY2026-27/000009",
    9,
    {
      packSpec: incompleteMissingOriginalSpec("fixture-incomplete-pack-missing-original"),
      attachments: [
        attachment("fixture-ev-thumb-only", "Invoice thumbnail (derivative, not original)", "verified", {
          category: "invoice",
          isDerivative: true,
          isRetainedOriginal: false,
          completeness: "not_complete",
        }),
      ],
    }
  );

  const invoiceRefOnly = registeredRecord("fixture-invoice-reference-only", "GRIN/MAIN/FY2026-27/000010", 10, {
    packSpec: invoiceReferenceOnlySpec("fixture-invoice-reference-only"),
    attachments: [
      attachment("fixture-ev-invoice-ref", "Invoice number INV-1 (reference only)", "pending", {
        isInvoiceReferenceOnly: true,
        isRetainedOriginal: false,
      }),
    ],
    exceptionBundle: baseExceptions({ invoiceLinked: false, challanLinked: false }),
  });

  const challanOnly = registeredRecord("fixture-challan-not-invoice", "GRIN/MAIN/FY2026-27/000011", 11, {
    original: {
      commercial: {
        ...sampleRegisterBody().commercial,
        supplierInvoiceNumber: { kind: "not_supplied" },
        supplierInvoiceDate: { kind: "not_supplied" },
        challanNumber: { kind: "present", value: "CH-77" },
        missingDocumentReason: { kind: "present", value: "Supplier sent a delivery challan; invoice pending." },
      },
    },
    packSpec: challanNotInvoiceSpec("fixture-challan-not-invoice"),
    attachments: [
      attachment("fixture-ev-challan", "Delivery challan (not an invoice)", "verified", {
        category: "invoice",
        isChallan: true,
        isRetainedOriginal: true,
      }),
    ],
    exceptionBundle: baseExceptions({ invoiceLinked: false, challanLinked: true }),
  });

  const unverified = registeredRecord("fixture-attachment-unverified", "GRIN/MAIN/FY2026-27/000012", 12, {
    attachments: [
      attachment("fixture-ev-unverified", "Weighment slip (hash not verified)", "pending", {
        category: "weighment",
        isRetainedOriginal: false,
      }),
    ],
    packSpec: incompleteMissingOriginalSpec("fixture-attachment-unverified"),
  });

  const mismatch = registeredRecord("fixture-party-amount-mismatch", "GRIN/MAIN/FY2026-27/000013", 13, {
    exceptionBundle: baseExceptions({
      partyMatch: false,
      amountMatch: false,
      grinParty: "Sample Supplier",
      otherParty: "Other Traders",
      grinAmountMinor: 118000,
      otherAmountMinor: 99000,
    }),
  });

  const supplierStatus = registeredRecord("fixture-supplier-status-observation", "GRIN/MAIN/FY2026-27/000014", 14, {
    exceptionBundle: baseExceptions({
      supplierStatus: "cancelled",
      observation: {
        observedAtUtc: "2026-09-30T08:00:00.000Z",
        source: "Imported GST status screenshot — not a live GST portal",
        sourceKind: "imported_document",
      },
    }),
  });

  return [
    offlineRecord,
    issued,
    gate,
    receivedRejected,
    partial,
    full,
    ewbCancelled,
    ewbUnknown,
    amended,
    incompletePack,
    invoiceRefOnly,
    challanOnly,
    unverified,
    mismatch,
    supplierStatus,
  ];
}

export const GRIN_FIXTURE_RECEIPT_IDS = [
  "fixture-offline-pending",
  "fixture-online-issued",
  "fixture-gate-refused",
  "fixture-received-then-rejected",
  "fixture-partial-return",
  "fixture-full-return",
  "fixture-ewb-cancelled-complete",
  "fixture-ewb-unknown",
  "fixture-amended-history",
  "fixture-incomplete-pack-missing-original",
  "fixture-invoice-reference-only",
  "fixture-challan-not-invoice",
  "fixture-attachment-unverified",
  "fixture-party-amount-mismatch",
  "fixture-supplier-status-observation",
] as const;
