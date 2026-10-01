import React, { useCallback, useMemo, useState } from "react";

import { quantity } from "@/goodsEvidence/quantities";
import { classifyShortageOrExcess } from "@/goodsEvidence/quantities";
import type { AcknowledgementOutcome, CaptureProvenance, CustodyState } from "@/goodsEvidence/types";
import type { EwbLink } from "@/goodsEvidence/ewb";
import { draftFromFormDefaults, presentText } from "@/services/grin/repository";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { spacing } from "@/theme/spacing";

import { grinMutationErrorMessage } from "./grinActionErrors";
import { GrinChoiceRow } from "./GrinChoiceRow";
import { GrinFixtureNotices } from "./GrinFixtureNotices";
import {
  originRepo,
  useFrozenGrinOrigin,
  useGrinRouter,
  useGrinT,
  useGrinThemedStyles,
} from "./grinScreenHooks";
import { Banner, Button, FormSection, Header, Screen, SelectField, TextField, View, StyleSheet } from "./grinSurfaces";

export function GrinCreateAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const router = useGrinRouter();
  const styles = useGrinThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierGstin, setSupplierGstin] = useState("");
  const [supplierReg, setSupplierReg] = useState<"registered" | "unregistered" | "not_supplied">("registered");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [po, setPo] = useState("");
  const [challan, setChallan] = useState("");
  const [ewbKind, setEwbKind] = useState<"present" | "none" | "unknown" | "not_applicable">("unknown");
  const [ewbNumber, setEwbNumber] = useState("");
  const [ewbGenerator, setEwbGenerator] = useState<"supplier" | "recipient" | "transporter" | "other" | "unknown">(
    "unknown"
  );
  const [vehicle, setVehicle] = useState("");
  const [transporter, setTransporter] = useState("");
  const [lr, setLr] = useState("");
  const [material, setMaterial] = useState("");
  const [hsn, setHsn] = useState("");
  const [invoiceQty, setInvoiceQty] = useState("");
  const [receivedQty, setReceivedQty] = useState("");
  const [qtyUnit, setQtyUnit] = useState("bags");
  const [grossWeight, setGrossWeight] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const [netWeight, setNetWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [packageCount, setPackageCount] = useState("");
  const [packageUnit, setPackageUnit] = useState("packages");
  const [damage, setDamage] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [bin, setBin] = useState("");
  const [receivingEmployee, setReceivingEmployee] = useState("");
  const [qcEmployee, setQcEmployee] = useState("");
  const [remarks, setRemarks] = useState("");
  const [reportedArrival, setReportedArrival] = useState(() => new Date().toISOString());
  const [timeZone, setTimeZone] = useState("Asia/Kolkata");
  const [capture, setCapture] = useState<CaptureProvenance>("offline");
  const [custody, setCustody] = useState<CustodyState>("received");
  const [ack, setAck] = useState<AcknowledgementOutcome>("not_requested");
  const [ackStatement, setAckStatement] = useState("");

  const maskRetired = useCallback(() => {
    setSupplierName("");
    setMaterial("");
    setRemarks("");
    setWarehouse("");
  }, []);

  const generatorOptions = useMemo(
    () => [
      { value: "supplier", label: t("grin.ewb.generator.supplier") },
      { value: "recipient", label: t("grin.ewb.generator.recipient") },
      { value: "transporter", label: t("grin.ewb.generator.transporter") },
      { value: "other", label: t("grin.ewb.generator.other") },
      { value: "unknown", label: t("grin.ewb.generator.unknown") },
    ],
    [t]
  );

  const onSave = useCallback(() => {
    if (!supplierName.trim() || !material.trim()) {
      setError(t("grin.errRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const draft = draftFromFormDefaults();
      draft.captureProvenance = capture;
      draft.reportedArrivalAt = reportedArrival.trim() || new Date().toISOString();
      draft.reportedArrivalTimeZone = timeZone;
      draft.custody = custody;
      draft.buyer = {
        legalName: buyerName.trim() || t("grin.optional.notSupplied"),
        gstin: presentText(buyerGstin),
        address: { kind: "not_supplied" },
      };
      draft.supplier = {
        name: presentText(supplierName),
        registration:
          supplierReg === "registered" && supplierGstin.trim()
            ? { kind: "registered", gstin: supplierGstin.trim() }
            : supplierReg === "unregistered"
              ? { kind: "unregistered" }
              : { kind: "not_supplied" },
        address: { kind: "not_supplied" },
        contact: { kind: "not_supplied" },
      };
      draft.commercial = {
        supplierInvoiceNumber: presentText(invoiceNumber),
        supplierInvoiceDate: presentText(invoiceDate),
        supplierInvoiceValue:
          invoiceValue.trim() && Number.isFinite(Number(invoiceValue))
            ? { currency: "INR", minorUnits: Math.round(Number(invoiceValue) * 100) }
            : null,
        purchaseOrderNumber: presentText(po),
        purchaseOrderInternalId: { kind: "not_supplied" },
        challanNumber: presentText(challan),
        missingDocumentReason: invoiceNumber.trim()
          ? { kind: "not_supplied" }
          : { kind: "present", value: t("grin.pack.invoiceRefNotRetained") },
      };
      let ewb: EwbLink;
      if (ewbKind === "present" && ewbNumber.trim()) {
        ewb = {
          kind: "present",
          ebn: ewbNumber.trim(),
          generatedBy: ewbGenerator,
          generatingIdentity: null,
          sourceGeneratedAt: null,
          sourceValidUntil: null,
        };
      } else if (ewbKind === "none") {
        ewb = { kind: "none" };
      } else if (ewbKind === "not_applicable") {
        ewb = { kind: "not_applicable", reason: t("grin.ewbUnknownExplicit") };
      } else {
        ewb = { kind: "unknown", reason: t("grin.ewbUnknownExplicit") };
      }
      draft.ewb = ewb;
      draft.transport = {
        vehicleNumber: presentText(vehicle),
        transporterName: presentText(transporter),
        transporterId: { kind: "not_supplied" },
        lrNumber: presentText(lr),
        mode: { kind: "present", value: "road" },
      };
      const received = quantity(receivedQty.trim() || "0", qtyUnit);
      const invoiced = invoiceQty.trim() ? quantity(invoiceQty.trim(), qtyUnit) : null;
      const expected = invoiced ?? received;
      let shortage: "shortage" | "excess" | "none" | "unknown" = "unknown";
      try {
        shortage = classifyShortageOrExcess({
          expectedOnThisDelivery: expected,
          physicallyReceived: received,
        });
      } catch {
        shortage = "unknown";
      }
      draft.lines = [
        {
          lineId: "line_1",
          description: material.trim(),
          hsn: presentText(hsn),
          invoiceLineRef: { kind: "not_supplied" },
          invoiceQuantity: invoiced,
          expectedOnThisDelivery: expected,
          physicallyReceived: received,
          unit: qtyUnit,
          grossWeight: grossWeight.trim() ? quantity(grossWeight.trim(), weightUnit) : null,
          tareWeight: tareWeight.trim() ? quantity(tareWeight.trim(), weightUnit) : null,
          netWeight: netWeight.trim() ? quantity(netWeight.trim(), weightUnit) : null,
          weightUnit: presentText(weightUnit),
          packageCount: packageCount.trim() ? quantity(packageCount.trim(), packageUnit, 0) : null,
          shortageOrExcess: shortage,
          condition: presentText(damage),
          qcStatus: null,
        },
      ];
      draft.warehouse = presentText(warehouse);
      draft.locationBin = presentText(bin);
      draft.receivingEmployeeAttributed = presentText(receivingEmployee);
      draft.qualityCheckedByAttributed = presentText(qcEmployee);
      draft.remarks = presentText(remarks);
      draft.acknowledgement = {
        outcome: ack,
        claimedRole: { kind: "not_supplied" },
        statement: ackStatement.trim() || t("grin.ack.notRequested"),
        explanation: { kind: "not_supplied" },
      };
      const saved = originRepo(origin).createQueued(draft);
      router.replace({ pathname: "/(app)/grin/[receiptId]", params: { receiptId: saved.receiptId } });
    } catch (caught) {
      const mapped = grinMutationErrorMessage(caught, t, "grin.errSave");
      if (mapped.retired) maskRetired();
      setError(mapped.message);
    } finally {
      setBusy(false);
    }
  }, [
    ack,
    ackStatement,
    bin,
    buyerGstin,
    buyerName,
    capture,
    challan,
    custody,
    damage,
    ewbGenerator,
    ewbKind,
    ewbNumber,
    grossWeight,
    hsn,
    invoiceDate,
    invoiceNumber,
    invoiceQty,
    invoiceValue,
    lr,
    maskRetired,
    material,
    netWeight,
    origin,
    packageCount,
    packageUnit,
    po,
    qtyUnit,
    qcEmployee,
    receivedQty,
    receivingEmployee,
    remarks,
    reportedArrival,
    router,
    supplierGstin,
    supplierName,
    supplierReg,
    t,
    tareWeight,
    timeZone,
    transporter,
    vehicle,
    warehouse,
    weightUnit,
  ]);

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.createTitle")} subtitle={t("grin.createIntro")} showBack />
        <GrinFixtureNotices />
        {error ? <Banner tone="danger" message={error} /> : null}

        <FormSection title={t("grin.section.times")} subtitle={t("grin.registrationVsArrival")}>
          <TextField
            label={t("grin.field.grinNumber")}
            value={t("grin.pdf.pendingNumber")}
            editable={false}
            accessibilityLabel={t("grin.field.grinNumber")}
          />
          <TextField
            label={t("grin.field.reportedArrival")}
            value={reportedArrival}
            onChangeText={setReportedArrival}
            accessibilityLabel={t("grin.field.reportedArrival")}
          />
          <TextField
            label={t("grin.field.timeZone")}
            value={timeZone}
            onChangeText={setTimeZone}
            accessibilityLabel={t("grin.field.timeZone")}
          />
          <GrinChoiceRow
            label={t("grin.field.capture")}
            value={capture}
            options={[
              { value: "offline", label: t("grin.capture.offline") },
              { value: "online", label: t("grin.capture.online") },
              { value: "late_entry", label: t("grin.capture.lateEntry") },
            ]}
            onChange={(value) => setCapture(value as CaptureProvenance)}
          />
          <GrinChoiceRow
            label={t("grin.field.custody")}
            value={custody}
            options={[
              { value: "received", label: t("grin.custody.received") },
              { value: "refused_at_gate", label: t("grin.custody.refusedAtGate") },
              { value: "held_for_qc", label: t("grin.custody.heldForQc") },
            ]}
            onChange={(value) => setCustody(value as CustodyState)}
          />
        </FormSection>

        <FormSection title={t("grin.section.supplier")}>
          <TextField label={t("grin.field.buyerName")} value={buyerName} onChangeText={setBuyerName} required accessibilityLabel={t("grin.field.buyerName")} />
          <TextField label={t("grin.field.buyerGstin")} value={buyerGstin} onChangeText={setBuyerGstin} autoCapitalize="characters" accessibilityLabel={t("grin.field.buyerGstin")} />
          <TextField label={t("grin.field.supplierName")} value={supplierName} onChangeText={setSupplierName} required accessibilityLabel={t("grin.field.supplierName")} />
          <GrinChoiceRow
            label={t("grin.field.supplierReg")}
            value={supplierReg}
            options={[
              { value: "registered", label: t("grin.supplierReg.registered") },
              { value: "unregistered", label: t("grin.supplierReg.unregistered") },
              { value: "not_supplied", label: t("grin.supplierReg.notSupplied") },
            ]}
            onChange={(value) => setSupplierReg(value as typeof supplierReg)}
          />
          <TextField label={t("grin.field.supplierGstin")} value={supplierGstin} onChangeText={setSupplierGstin} autoCapitalize="characters" accessibilityLabel={t("grin.field.supplierGstin")} />
        </FormSection>

        <FormSection title={t("grin.section.commercial")}>
          <TextField label={t("grin.field.invoiceNumber")} value={invoiceNumber} onChangeText={setInvoiceNumber} accessibilityLabel={t("grin.field.invoiceNumber")} />
          <TextField label={t("grin.field.invoiceDate")} value={invoiceDate} onChangeText={setInvoiceDate} accessibilityLabel={t("grin.field.invoiceDate")} />
          <TextField label={t("grin.field.invoiceValue")} value={invoiceValue} onChangeText={setInvoiceValue} keyboardType="decimal-pad" accessibilityLabel={t("grin.field.invoiceValue")} />
          <TextField label={t("grin.field.po")} value={po} onChangeText={setPo} accessibilityLabel={t("grin.field.po")} />
          <TextField label={t("grin.field.challan")} value={challan} onChangeText={setChallan} accessibilityLabel={t("grin.field.challan")} />
        </FormSection>

        <FormSection title={t("grin.section.ewb")} subtitle={t("grin.ewbUnknownExplicit")}>
          <SelectField
            label={t("grin.field.ewb")}
            value={ewbKind}
            options={[
              { value: "unknown", label: t("grin.ewb.status.unknown") },
              { value: "present", label: t("grin.ewb.status.generatedActive") },
              { value: "none", label: t("grin.optional.notSupplied") },
              { value: "not_applicable", label: t("grin.exception.kind.notApplicable") },
            ]}
            onChange={(value) => setEwbKind(value as typeof ewbKind)}
          />
          {ewbKind === "present" ? (
            <>
              <TextField label={t("grin.field.ewb")} value={ewbNumber} onChangeText={setEwbNumber} accessibilityLabel={t("grin.field.ewb")} />
              <SelectField
                label={t("grin.field.ewbGenerator")}
                value={ewbGenerator}
                options={generatorOptions}
                onChange={(value) => setEwbGenerator(value as typeof ewbGenerator)}
              />
            </>
          ) : null}
        </FormSection>

        <FormSection title={t("grin.section.transport")}>
          <TextField label={t("grin.field.vehicle")} value={vehicle} onChangeText={setVehicle} autoCapitalize="characters" accessibilityLabel={t("grin.field.vehicle")} />
          <TextField label={t("grin.field.transporter")} value={transporter} onChangeText={setTransporter} accessibilityLabel={t("grin.field.transporter")} />
          <TextField label={t("grin.field.lr")} value={lr} onChangeText={setLr} accessibilityLabel={t("grin.field.lr")} />
        </FormSection>

        <FormSection title={t("grin.section.lines")} subtitle={t("grin.returnUnitHint")}>
          <TextField label={t("grin.field.material")} value={material} onChangeText={setMaterial} required accessibilityLabel={t("grin.field.material")} />
          <TextField label={t("grin.field.hsn")} value={hsn} onChangeText={setHsn} accessibilityLabel={t("grin.field.hsn")} />
          <TextField label={t("grin.field.invoiceQty")} value={invoiceQty} onChangeText={setInvoiceQty} keyboardType="decimal-pad" accessibilityLabel={t("grin.field.invoiceQty")} />
          <TextField label={t("grin.field.receivedQty")} value={receivedQty} onChangeText={setReceivedQty} keyboardType="decimal-pad" accessibilityLabel={t("grin.field.receivedQty")} />
          <TextField label={t("grin.field.unit")} value={qtyUnit} onChangeText={setQtyUnit} accessibilityLabel={t("grin.field.unit")} />
          <TextField label={t("grin.field.grossWeight")} value={grossWeight} onChangeText={setGrossWeight} keyboardType="decimal-pad" accessibilityLabel={t("grin.field.grossWeight")} />
          <TextField label={t("grin.field.tareWeight")} value={tareWeight} onChangeText={setTareWeight} keyboardType="decimal-pad" accessibilityLabel={t("grin.field.tareWeight")} />
          <TextField label={t("grin.field.netWeight")} value={netWeight} onChangeText={setNetWeight} keyboardType="decimal-pad" accessibilityLabel={t("grin.field.netWeight")} />
          <TextField label={t("grin.field.weightUnit")} value={weightUnit} onChangeText={setWeightUnit} accessibilityLabel={t("grin.field.weightUnit")} />
          <TextField label={t("grin.field.packageCount")} value={packageCount} onChangeText={setPackageCount} keyboardType="number-pad" accessibilityLabel={t("grin.field.packageCount")} />
          <TextField label={t("grin.field.packageUnit")} value={packageUnit} onChangeText={setPackageUnit} accessibilityLabel={t("grin.field.packageUnit")} />
          <TextField label={t("grin.field.damage")} value={damage} onChangeText={setDamage} accessibilityLabel={t("grin.field.damage")} />
        </FormSection>

        <FormSection title={t("grin.section.warehouse")}>
          <TextField label={t("grin.field.warehouse")} value={warehouse} onChangeText={setWarehouse} accessibilityLabel={t("grin.field.warehouse")} />
          <TextField label={t("grin.field.bin")} value={bin} onChangeText={setBin} accessibilityLabel={t("grin.field.bin")} />
          <TextField
            label={t("grin.field.receivingEmployee")}
            value={receivingEmployee}
            onChangeText={setReceivingEmployee}
            hint={t("grin.attributionNotSignature")}
            accessibilityLabel={t("grin.field.receivingEmployee")}
          />
          <TextField
            label={t("grin.field.qcEmployee")}
            value={qcEmployee}
            onChangeText={setQcEmployee}
            hint={t("grin.attributionNotSignature")}
            accessibilityLabel={t("grin.field.qcEmployee")}
          />
        </FormSection>

        <FormSection title={t("grin.section.ack")}>
          <GrinChoiceRow
            label={t("grin.field.ack")}
            value={ack}
            options={[
              { value: "not_requested", label: t("grin.ack.notRequested") },
              { value: "signed", label: t("grin.ack.signed") },
              { value: "refused", label: t("grin.ack.refused") },
              { value: "unavailable", label: t("grin.ack.unavailable") },
            ]}
            onChange={(value) => setAck(value as AcknowledgementOutcome)}
          />
          <TextField label={t("grin.field.remarks")} value={remarks} onChangeText={setRemarks} multiline accessibilityLabel={t("grin.field.remarks")} />
          <TextField label={t("grin.field.ackStatement")} value={ackStatement} onChangeText={setAckStatement} multiline accessibilityLabel={t("grin.field.ackStatement")} />
        </FormSection>

        <Button label={t("grin.saveAction")} onPress={onSave} loading={busy} />
      </View>
    </Screen>
  );
}
