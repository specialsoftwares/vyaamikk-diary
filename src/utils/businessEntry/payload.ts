import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import { mergeComposerLocationWithLabel } from "@/services/location/locationRecordService";
import {
  buildIndianPostalFromForm,
  legacyLocationFromPostalForm,
  type PostalFieldPrefix,
} from "@/utils/location/postalForm";
import { buildPaymentBankDetailsFromForm } from "@/utils/businessEntry/paymentBankDetails";
import { buildAutoPaymentRequestNote } from "@/utils/businessEntry/paymentRequestNote";
import { parseINRInput } from "@/utils/money/inr";
import { normalizeCashPaidDayMs } from "@/utils/businessEntry/cashPaidDate";
import { normalizeEwayBillInput } from "@/utils/businessEntry/ewayBill";

function legacyLine(
  prefix: PostalFieldPrefix,
  values: Record<string, unknown>,
  fallbackKey: string
): string | null {
  const built = legacyLocationFromPostalForm(prefix, values).trim();
  if (built) return built;
  const fb = String(values[fallbackKey] ?? "").trim();
  return fb || null;
}

/** Map validated composer form values → storage payload + shared fields. */
export function formValuesToEntryParts(
  entryType: BusinessEntryType,
  values: Record<string, unknown>,
  ueid: string
): Pick<
  BusinessEntry,
  "entryType" | "title" | "entryDate" | "notes" | "reminder" | "location" | "payload" | "ueid"
> {
  const title = String(values.title ?? "").trim();
  const entryDate = Number(values.entryDate);
  const notes =
    typeof values.notes === "string" && values.notes.trim() ? values.notes.trim() : null;
  const reminder = (values.reminder as BusinessEntry["reminder"]) ?? null;
  switch (entryType) {
    case "work_update_issue":
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes,
        reminder,
        location: mergeComposerLocationWithLabel(values, null),
        payload: {
          workDone: values.workDone ? String(values.workDone).trim() : null,
          issueProblem: values.issueProblem ? String(values.issueProblem).trim() : null,
          sitePlace:
            typeof values.sitePlace === "string" && values.sitePlace.trim()
              ? values.sitePlace.trim()
              : null,
          quantityOutput:
            typeof values.quantityOutput === "string" && values.quantityOutput.trim()
              ? values.quantityOutput.trim()
              : null,
          responsiblePerson:
            typeof values.responsiblePerson === "string" && values.responsiblePerson.trim()
              ? values.responsiblePerson.trim()
              : null,
          followUpRequired: Boolean(values.followUpRequired),
        },
      };
    case "staff_matter":
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes,
        reminder,
        location: null,
        payload: {
          staffName: String(values.staffName).trim(),
          matterDetails: String(values.matterDetails).trim(),
          matterType: values.matterType as import("@/domain/businessEntry").StaffMatterType,
          actionRequired:
            typeof values.actionRequired === "string" && values.actionRequired
              ? values.actionRequired
              : null,
        },
      };
    case "business_cash_given": {
      const paymentDate = normalizeCashPaidDayMs(
        Number(values.paymentDate ?? values.entryDate)
      );
      return {
        ueid,
        entryType,
        title,
        entryDate: paymentDate,
        notes,
        reminder,
        location: mergeComposerLocationWithLabel(
          values,
          typeof values.siteRef === "string" && values.siteRef.trim()
            ? values.siteRef.trim()
            : null
        ),
        payload: {
          amount: parseINRInput(values.amount) ?? 0,
          givenToName: String(values.givenToName).trim(),
          purpose: String(values.purpose).trim(),
          paymentDate,
          paymentMode: "Cash",
          settlementStatus:
            (values.settlementStatus as import("@/domain/businessEntry").CashSettlementStatus) ??
            "pending",
          contactMobile:
            typeof values.contactMobile === "string" ? values.contactMobile : null,
          businessRef:
            typeof values.businessRef === "string" ? values.businessRef : null,
          siteRef: typeof values.siteRef === "string" ? values.siteRef : null,
          expectedSettlementDate:
            values.expectedSettlementDate == null
              ? null
              : Number(values.expectedSettlementDate),
          remarks: typeof values.remarks === "string" ? values.remarks : null,
        },
      };
    }
    case "material_dispatched": {
      const dispatchFromPostal = buildIndianPostalFromForm("dispatchFrom", values);
      const deliveryToPostal = buildIndianPostalFromForm("deliveryTo", values);
      const dispatchLocation = legacyLine("dispatchFrom", values, "dispatchLocation");
      const destination = legacyLine("deliveryTo", values, "destination");
      const bill =
        typeof values.billChallanNumber === "string" && values.billChallanNumber.trim()
          ? values.billChallanNumber.trim()
          : typeof values.invoiceChallan === "string" && values.invoiceChallan.trim()
            ? values.invoiceChallan.trim()
            : null;
      const ewayRaw =
        typeof values.ewayBillNumber === "string" ? values.ewayBillNumber.trim() : "";
      const ewayBillNumber = ewayRaw ? normalizeEwayBillInput(ewayRaw) : null;
      const boxes =
        values.totalBoxes != null && values.totalBoxes !== ""
          ? Number(values.totalBoxes)
          : null;
      const weight =
        values.totalWeight != null && values.totalWeight !== ""
          ? Number(values.totalWeight)
          : null;
      const freightAmt =
        values.freightAmount != null && values.freightAmount !== ""
          ? parseINRInput(values.freightAmount)
          : null;
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes,
        reminder,
        location: mergeComposerLocationWithLabel(values, dispatchLocation),
        payload: {
          partyName: String(values.partyName).trim(),
          materialName: String(values.materialName).trim(),
          quantity: Number(values.quantity),
          unit: String(values.unit).trim(),
          invoiceChallan: bill,
          vehicleNumber:
            typeof values.vehicleNumber === "string" && values.vehicleNumber.trim()
              ? values.vehicleNumber.trim()
              : null,
          transporter:
            typeof values.transporterName === "string" && values.transporterName.trim()
              ? values.transporterName.trim()
              : typeof values.transporter === "string" && values.transporter.trim()
                ? values.transporter.trim()
                : null,
          lrGrNumber:
            typeof values.lrGrNumber === "string" && values.lrGrNumber.trim()
              ? values.lrGrNumber.trim()
              : null,
          dispatchLocation,
          destination,
          dispatchFromPostal,
          deliveryToPostal,
          expectedDeliveryDate:
            values.expectedDeliveryDate == null
              ? null
              : Number(values.expectedDeliveryDate),
          remarks:
            typeof values.remarks === "string" && values.remarks.trim()
              ? values.remarks.trim()
              : null,
          ewayBillNumber,
          materialDescription:
            typeof values.materialDescription === "string" && values.materialDescription.trim()
              ? values.materialDescription.trim()
              : null,
          referenceNote:
            typeof values.referenceNote === "string" && values.referenceNote.trim()
              ? values.referenceNote.trim()
              : null,
          totalBoxes: boxes != null && boxes > 0 ? boxes : null,
          totalWeight: weight != null && weight > 0 ? weight : null,
          weightUnit:
            typeof values.weightUnit === "string" && values.weightUnit.trim()
              ? values.weightUnit.trim()
              : null,
          freightType: values.freightType as import("@/domain/businessEntry").FreightType,
          freightAmount: freightAmt,
          ccCopyInstruction:
            values.ccCopyInstruction as import("@/domain/businessEntry").CcCopyInstruction,
          clarificationContactName:
            typeof values.clarificationContactName === "string" &&
            values.clarificationContactName.trim()
              ? values.clarificationContactName.trim()
              : null,
          clarificationContactMobile:
            typeof values.clarificationContactMobile === "string" &&
            values.clarificationContactMobile.trim()
              ? values.clarificationContactMobile.trim()
              : null,
        },
      };
    }
    case "material_received": {
      const receivedAtPostal = buildIndianPostalFromForm("receivedAt", values);
      const supplierPostal = buildIndianPostalFromForm("party", values);
      const dispatchFromPostal = buildIndianPostalFromForm("dispatchFrom", values);
      const receivedLocation = legacyLine("receivedAt", values, "receivedLocation");
      const dispatchFromLocation = legacyLine("dispatchFrom", values, "dispatchFromLocation");
      const ewayRaw =
        typeof values.ewayBillNumber === "string" ? values.ewayBillNumber.trim() : "";
      const ewayBillNumber = ewayRaw ? normalizeEwayBillInput(ewayRaw) : null;
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes,
        reminder,
        location: mergeComposerLocationWithLabel(values, receivedLocation),
        payload: {
          supplierName: String(values.supplierName).trim(),
          materialName: String(values.materialName).trim(),
          quantity: Number(values.quantity),
          unit: String(values.unit).trim(),
          invoiceBill: typeof values.invoiceBill === "string" ? values.invoiceBill : null,
          vehicleNumber:
            typeof values.vehicleNumber === "string" ? values.vehicleNumber : null,
          receivedLocation,
          receivedAtPostal,
          supplierPostal,
          dispatchFromPostal,
          ewayBillNumber,
          checkedBy: typeof values.checkedBy === "string" ? values.checkedBy : null,
          qualityStatus: values.qualityStatus as import("@/domain/businessEntry").MaterialQualityStatus,
          issueNote: typeof values.issueNote === "string" ? values.issueNote : null,
          paymentFollowUp: Boolean(values.paymentFollowUp),
        },
      };
    }
    case "material_return": {
      const returnFromPostal = buildIndianPostalFromForm("dispatchFrom", values);
      const returnToPostal = buildIndianPostalFromForm("deliveryTo", values);
      const fromLocation = legacyLine("dispatchFrom", values, "fromLocation");
      const toLocation = legacyLine("deliveryTo", values, "toLocation");
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes,
        reminder,
        location: mergeComposerLocationWithLabel(values, fromLocation),
        payload: {
          partyName: String(values.partyName).trim(),
          materialName: String(values.materialName).trim(),
          quantity: Number(values.quantity),
          unit: String(values.unit).trim(),
          returnReason: String(values.returnReason).trim(),
          fromLocation,
          toLocation,
          returnFromPostal,
          returnToPostal,
          lrGrNumber:
            typeof values.lrGrNumber === "string" && values.lrGrNumber.trim()
              ? values.lrGrNumber.trim()
              : null,
          vehicleNumber:
            typeof values.vehicleNumber === "string" && values.vehicleNumber.trim()
              ? values.vehicleNumber.trim()
              : null,
          transporter:
            typeof values.transporter === "string" && values.transporter.trim()
              ? values.transporter.trim()
              : null,
          remarks:
            typeof values.remarks === "string" && values.remarks.trim()
              ? values.remarks.trim()
              : null,
        },
      };
    }
    case "reminder_purchase":
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes,
        reminder,
        location: null,
        payload: {
          itemMaterial: String(values.itemMaterial).trim(),
          requiredQuantity:
            typeof values.requiredQuantity === "string" ? values.requiredQuantity : null,
          requiredByDate:
            values.requiredByDate == null ? null : Number(values.requiredByDate),
          vendor: typeof values.vendor === "string" ? values.vendor : null,
          estimatedAmount:
            typeof values.estimatedAmount === "string" ? values.estimatedAmount : null,
          priority: values.priority as "low" | "normal" | "high" | null,
        },
      };
    case "reminder_email":
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes,
        reminder,
        location: null,
        payload: {
          purposeSubject: String(values.purposeSubject).trim(),
          recipientName:
            typeof values.recipientName === "string" ? values.recipientName : null,
          recipientEmail:
            typeof values.recipientEmail === "string" ? values.recipientEmail : null,
          relatedMatter:
            typeof values.relatedMatter === "string" ? values.relatedMatter : null,
          draftNotes: typeof values.draftNotes === "string" ? values.draftNotes : null,
        },
      };
    case "reminder_gst_return":
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes,
        reminder,
        location: null,
        payload: {
          returnType: values.returnType as import("@/domain/businessEntry").GstReturnType,
          taxPeriod: String(values.taxPeriod).trim(),
          dueDate: Number(values.dueDate),
          gstin: typeof values.gstin === "string" ? values.gstin : null,
          businessName:
            typeof values.businessName === "string" ? values.businessName : null,
          complianceNote:
            typeof values.complianceNote === "string" ? values.complianceNote : null,
        },
      };
    case "payment_request": {
      const partyName = String(values.partyName).trim();
      const invoiceNumber = String(values.invoiceNumber).trim();
      const pendingAmount = parseINRInput(values.pendingAmount) ?? 0;
      const userNote =
        typeof values.requestNote === "string" && values.requestNote.trim()
          ? values.requestNote.trim()
          : null;
      const { includeBankDetailsInPdf, bankDetails } =
        buildPaymentBankDetailsFromForm(values);
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes: null,
        reminder: null,
        location: null,
        payload: {
          partyName,
          invoiceNumber,
          invoiceDate:
            values.invoiceDate == null || values.invoiceDate === ""
              ? null
              : Number(values.invoiceDate),
          pendingAmount,
          dueDate: values.dueDate == null ? null : Number(values.dueDate),
          contactPerson:
            typeof values.contactPerson === "string" && values.contactPerson.trim()
              ? values.contactPerson.trim()
              : null,
          requestNote:
            userNote ??
            buildAutoPaymentRequestNote({ partyName, invoiceNumber, pendingAmount }),
          includeBankDetailsInPdf,
          includePaymentPeriodInPdf: Boolean(values.includePaymentPeriodInPdf),
          bankDetails,
          partyPostal: buildIndianPostalFromForm("party", values),
        } as import("@/domain/businessEntry").PaymentRequestPayload,
      };
    }
    case "outward_freight_details": {
      const dispatchFromPostal = buildIndianPostalFromForm("dispatchFrom", values);
      const deliveryToPostal = buildIndianPostalFromForm("deliveryTo", values);
      const deliveryLocation = legacyLine("deliveryTo", values, "deliveryLocation");
      const dispatchFromLocation = legacyLine("dispatchFrom", values, "dispatchFromLocation");
      const billRaw =
        typeof values.billChallanNumber === "string" && values.billChallanNumber.trim()
          ? values.billChallanNumber.trim()
          : typeof values.billNumber === "string"
            ? values.billNumber.trim()
            : "";
      const ewayRaw =
        typeof values.ewayBillNumber === "string" ? values.ewayBillNumber.trim() : "";
      const ewayBillNumber = ewayRaw ? normalizeEwayBillInput(ewayRaw) : null;
      const boxes =
        values.totalBoxes != null && values.totalBoxes !== ""
          ? Number(values.totalBoxes)
          : 0;
      const weight =
        values.totalWeight != null && values.totalWeight !== ""
          ? Number(values.totalWeight)
          : 0;
      const freightAmt =
        values.freightAmount != null && values.freightAmount !== ""
          ? parseINRInput(values.freightAmount)
          : null;
      return {
        ueid,
        entryType,
        title,
        entryDate,
        notes,
        reminder,
        location: mergeComposerLocationWithLabel(values, deliveryLocation),
        payload: {
          dispatchTitle:
            typeof values.dispatchTitle === "string" && values.dispatchTitle.trim()
              ? values.dispatchTitle.trim()
              : null,
          billNumber: billRaw,
          billDate:
            values.billDate == null || values.billDate === ""
              ? null
              : Number(values.billDate),
          lrGrNumber:
            typeof values.lrGrNumber === "string" && values.lrGrNumber.trim()
              ? values.lrGrNumber.trim()
              : null,
          deliveryLocation: deliveryLocation ?? "",
          dispatchFromLocation,
          dispatchFromPostal,
          deliveryToPostal,
          totalBoxes: boxes,
          totalWeight: weight,
          weightUnit:
            typeof values.weightUnit === "string" && values.weightUnit.trim()
              ? values.weightUnit.trim()
              : "Kg",
          freightType: values.freightType as import("@/domain/businessEntry").FreightType,
          transporterName:
            typeof values.transporterName === "string" && values.transporterName.trim()
              ? values.transporterName.trim()
              : null,
          vehicleNumber:
            typeof values.vehicleNumber === "string" && values.vehicleNumber.trim()
              ? values.vehicleNumber.trim()
              : null,
          ccCopyInstruction:
            values.ccCopyInstruction as import("@/domain/businessEntry").CcCopyInstruction,
          clarificationContactName:
            typeof values.clarificationContactName === "string"
              ? values.clarificationContactName.trim()
              : "",
          clarificationContactMobile:
            typeof values.clarificationContactMobile === "string"
              ? values.clarificationContactMobile.trim()
              : "",
          remarks:
            typeof values.remarks === "string" && values.remarks.trim()
              ? values.remarks.trim()
              : null,
          partyName:
            typeof values.partyName === "string" && values.partyName.trim()
              ? values.partyName.trim()
              : null,
          materialName:
            typeof values.materialName === "string" && values.materialName.trim()
              ? values.materialName.trim()
              : null,
          linkedDispatchId:
            typeof values.linkedDispatchId === "string" && values.linkedDispatchId.trim()
              ? values.linkedDispatchId.trim()
              : null,
          linkedDispatchUpdatedAt:
            values.linkedDispatchUpdatedAt == null
              ? null
              : Number(values.linkedDispatchUpdatedAt),
          ewayBillNumber,
          materialDescription:
            typeof values.materialDescription === "string" && values.materialDescription.trim()
              ? values.materialDescription.trim()
              : null,
          referenceNote:
            typeof values.referenceNote === "string" && values.referenceNote.trim()
              ? values.referenceNote.trim()
              : null,
          freightAmount: freightAmt,
        } as import("@/domain/businessEntry").OutwardFreightPayload,
      };
    }
    default:
      throw new Error(`Unsupported entry type: ${entryType}`);
  }
}
