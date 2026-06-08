import { z } from "zod";

import type { BusinessEntryType } from "@/domain/businessEntry";
import {
  paymentRequestCreatedDateMs,
  validateRecordDate,
} from "@/services/recordDatePolicy";
import { isValidIfsc, isValidUpiId } from "@/utils/businessEntry/paymentBankDetails";
import {
  postalFormShape,
  refinePostalPin,
  refineRequiredPostalLine,
} from "@/utils/businessEntry/postalValidation";
import { parseINRInputOrNaN } from "@/utils/money/inr";
import { normalizeCashPaidDayMs } from "@/utils/businessEntry/cashPaidDate";
import { refineRecordDatePolicy } from "@/utils/businessEntry/datePolicyRefine";
import { ewayBillValidationMessage } from "@/utils/businessEntry/ewayBill";
import {
  outwardHasCompleteItem,
  outwardHasTransportSignal,
  outwardItemStarted,
} from "@/utils/businessEntry/outwardMovement";
import { isValidIndianPincode, normalizeIndianPinInput } from "@/services/location/pincodeResolver";

const trimOpt = (max: number) =>
  z.preprocess(
    (v) => (v == null ? "" : String(v)),
    z
      .string()
      .transform((s) => s.trim())
      .transform((s) => (s === "" ? null : s))
      .pipe(z.string().max(max).nullable())
  );

const trimReq = (max: number, msg: string) =>
  z.string().trim().min(1, msg).max(max);

const reminderSchema = z
  .object({
    at: z.number().int().positive(),
    note: z.string().trim().max(200).transform((s) => s || ""),
    notificationId: z.string().nullable(),
  })
  .nullable();

export type DatePolicySchemaOptions = {
  existingCashPaidDateMs?: number | null;
  existingEntryDateMs?: number | null;
  existingBillDateMs?: number | null;
  existingInvoiceDateMs?: number | null;
  existingDueDateMs?: number | null;
  existingReminderAtMs?: number | null;
};

function existingMs(
  opts: DatePolicySchemaOptions | undefined,
  field: keyof DatePolicySchemaOptions
): number | null | undefined {
  if (!opts) return undefined;
  return opts[field] ?? undefined;
}

function refineReminderFuture(
  d: { reminder: { at: number } | null },
  ctx: z.RefinementCtx,
  opts?: DatePolicySchemaOptions
) {
  if (!d.reminder) return;
  refineRecordDatePolicy("reminder_future_3m", ["reminder", "at"], d.reminder.at, ctx, {
    existingMs: existingMs(opts, "existingReminderAtMs"),
  });
}

/** Minimal schemas — only fields shown in the composer UI. */
export function buildWorkUpdateSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      workDone: z.string().trim().max(3000),
      issueProblem: z.string().trim().max(3000),
      sitePlace: trimOpt(120),
      followUpRequired: z.boolean(),
      reminder: reminderSchema,
      notes: trimOpt(5000),
    })
    .superRefine((d, ctx) => {
      refineRecordDatePolicy("event_past_15", "entryDate", d.entryDate, ctx, {
        existingMs: existingMs(opts, "existingEntryDateMs"),
      });
      if (!d.workDone && !d.issueProblem) {
        ctx.addIssue({
          code: "custom",
          message: "Enter work done or an issue.",
          path: ["workDone"],
        });
      }
      if (d.followUpRequired && !d.reminder) {
        ctx.addIssue({
          code: "custom",
          message: "Pick a follow-up date and time.",
          path: ["reminder"],
        });
      }
      if (d.followUpRequired && d.reminder) {
        refineReminderFuture(d, ctx, opts);
      }
    });
}

export const workUpdateSchema = buildWorkUpdateSchema();

export function buildStaffMatterSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      staffName: trimReq(120, "Staff name is required."),
      matterDetails: trimReq(2000, "Describe the matter."),
      matterType: z.literal("other_note").default("other_note"),
      actionRequired: z.null().optional(),
      reminder: z.null().optional(),
      notes: trimOpt(5000),
    })
    .superRefine((d, ctx) => {
      refineRecordDatePolicy("event_past_15", "entryDate", d.entryDate, ctx, {
        existingMs: existingMs(opts, "existingEntryDateMs"),
      });
    });
}

export const staffMatterSchema = buildStaffMatterSchema();

const positiveNumber = z.preprocess(
  (val) => {
    if (val === "" || val === undefined || val === null) return NaN;
    return typeof val === "number" ? val : Number(val);
  },
  z.number().positive("Enter a value greater than zero.")
);

const inrAmountField = z.preprocess(
  (val) => parseINRInputOrNaN(val),
  z.number().positive("Enter an amount greater than zero.")
);

export function buildCashGivenSchema(existingPaymentDateMs?: number | null) {
  const opts: DatePolicySchemaOptions = { existingCashPaidDateMs: existingPaymentDateMs };
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      amount: inrAmountField,
      givenToName: trimReq(120, "Who received the cash?"),
      purpose: trimReq(500, "What was this for?"),
      paymentDate: z.number().int().positive(),
      notes: trimOpt(5000),
    })
    .superRefine((d, ctx) => {
      refineRecordDatePolicy("cash_paid", "paymentDate", d.paymentDate, ctx, {
        existingMs: existingMs(opts, "existingCashPaidDateMs"),
      });
    })
    .transform((d) => {
      const paymentDate = normalizeCashPaidDayMs(d.paymentDate);
      return {
        ...d,
        entryDate: paymentDate,
        paymentMode: "Cash" as const,
        paymentDate,
        settlementStatus: "pending" as const,
        contactMobile: null,
        businessRef: null,
        siteRef: null,
        expectedSettlementDate: null,
        reminder: null,
        remarks: null,
      };
    });
}

export const cashGivenSchema = buildCashGivenSchema();

export function buildMaterialDispatchedSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      partyName: trimReq(120, "Party / customer name is required."),
      materialName: trimReq(120, "Material name is required."),
      quantity: positiveNumber,
      unit: trimReq(40, "Unit is required (e.g. kg, pcs)."),
      invoiceChallan: trimOpt(80),
      vehicleNumber: trimOpt(40),
      transporter: trimOpt(120),
      lrGrNumber: trimOpt(64),
      dispatchLocation: trimOpt(200),
      destination: trimOpt(200),
      expectedDeliveryDate: z.number().int().positive().nullable().optional(),
      remarks: trimOpt(2000),
      reminder: reminderSchema,
      notes: trimOpt(5000),
      ...postalFormShape("dispatchFrom"),
      ...postalFormShape("deliveryTo"),
    })
    .superRefine((d, ctx) => {
      refineRecordDatePolicy("event_past_15", "entryDate", d.entryDate, ctx, {
        existingMs: existingMs(opts, "existingEntryDateMs"),
      });
      refinePostalPin(d as Record<string, unknown>, "dispatchFrom", ctx);
      refinePostalPin(d as Record<string, unknown>, "deliveryTo", ctx);
      refineRequiredPostalLine(
        d as Record<string, unknown>,
        "deliveryTo",
        "destination",
        ctx,
        "composer.deliveryRequired"
      );
      if (d.reminder) refineReminderFuture(d, ctx, opts);
    });
}

export const materialDispatchedSchema = buildMaterialDispatchedSchema();

const optionalPositiveNumber = z.preprocess(
  (val) => {
    if (val === "" || val === undefined || val === null) return null;
    const n = typeof val === "number" ? val : Number(val);
    return Number.isFinite(n) && n > 0 ? n : null;
  },
  z.number().positive().nullable()
);

const optionalPositiveInt = z.preprocess(
  (val) => {
    if (val === "" || val === undefined || val === null) return null;
    const n = typeof val === "number" ? Math.floor(val) : Math.floor(Number(val));
    return Number.isFinite(n) && n > 0 ? n : null;
  },
  z.number().int().positive().nullable()
);

function refineRequiredPin(
  values: Record<string, unknown>,
  prefix: "dispatchFrom" | "deliveryTo",
  ctx: z.RefinementCtx,
  messageKey: string
): void {
  const pin = normalizeIndianPinInput(String(values[`${prefix}Pin`] ?? ""));
  if (pin.length >= 6 && isValidIndianPincode(pin)) return;
  ctx.addIssue({
    code: "custom",
    message: messageKey,
    path: [`${prefix}Pin`],
  });
}

/** Unified outward movement — dispatch + transport in one form. */
export function buildOutwardMovementSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      movementType: z.literal("sent_transport").optional(),
      partyName: trimReq(120, "Party / customer / consignee is required."),
      billChallanNumber: trimOpt(80),
      ewayBillNumber: z
        .preprocess(
          (v) => (v == null ? "" : String(v).replace(/\D/g, "").slice(0, 12)),
          z.string()
        )
        .optional()
        .default(""),
      referenceNote: trimOpt(500),
      materialName: z.string().trim().max(120).optional().default(""),
      materialDescription: trimOpt(500),
      quantity: z.preprocess(
        (val) => {
          if (val === "" || val === undefined || val === null) return null;
          const n = typeof val === "number" ? val : Number(val);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        z.number().positive().nullable().optional()
      ),
      unit: z.string().trim().max(40).optional().default(""),
      dispatchLocation: trimOpt(200),
      destination: trimOpt(200),
      dispatchFromLocation: trimOpt(200),
      deliveryLocation: trimOpt(200),
      totalBoxes: optionalPositiveInt,
      totalWeight: optionalPositiveNumber,
      weightUnit: z.string().trim().max(12).optional().default("Kg"),
      freightType: z.enum(["to_pay", "paid", "tbb", "other"]).optional().default("to_pay"),
      freightAmount: optionalPositiveNumber,
      transporterName: trimOpt(120),
      lrGrNumber: trimOpt(64),
      vehicleNumber: trimOpt(40),
      ccCopyInstruction: z
        .enum(["attach", "not_attached", "not_applicable"])
        .optional()
        .default("not_attached"),
      clarificationContactName: trimOpt(120),
      clarificationContactMobile: trimOpt(15),
      remarks: trimOpt(2000),
      linkedDispatchId: trimOpt(64),
      linkedDispatchUpdatedAt: z.number().int().positive().nullable().optional(),
      expectedDeliveryDate: z.number().int().positive().nullable().optional(),
      reminder: reminderSchema,
      notes: trimOpt(5000),
      ...postalFormShape("dispatchFrom"),
      ...postalFormShape("deliveryTo"),
    })
    .superRefine((d, ctx) => {
      refineRecordDatePolicy("event_past_15", "entryDate", d.entryDate, ctx, {
        existingMs: existingMs(opts, "existingEntryDateMs"),
      });
      refinePostalPin(d as Record<string, unknown>, "dispatchFrom", ctx);
      refinePostalPin(d as Record<string, unknown>, "deliveryTo", ctx);
      refineRequiredPin(
        d as Record<string, unknown>,
        "dispatchFrom",
        ctx,
        "materialMovement.fromPinRequired"
      );
      refineRequiredPin(
        d as Record<string, unknown>,
        "deliveryTo",
        ctx,
        "materialMovement.toPinRequired"
      );
      const ewayMsg = ewayBillValidationMessage(d.ewayBillNumber);
      if (ewayMsg) {
        ctx.addIssue({ code: "custom", message: ewayMsg, path: ["ewayBillNumber"] });
      }
      const values = d as Record<string, unknown>;
      if (outwardItemStarted(values)) {
        if (!String(d.materialName ?? "").trim()) {
          ctx.addIssue({
            code: "custom",
            message: "Item name is required when quantity or unit is entered.",
            path: ["materialName"],
          });
        }
        if (!String(d.unit ?? "").trim()) {
          ctx.addIssue({
            code: "custom",
            message: "Unit is required when item details are entered.",
            path: ["unit"],
          });
        }
        if (d.quantity == null) {
          ctx.addIssue({
            code: "custom",
            message: "Enter a value greater than zero.",
            path: ["quantity"],
          });
        }
      }
      if (!outwardHasCompleteItem(values) && !outwardHasTransportSignal(values)) {
        ctx.addIssue({
          code: "custom",
          message: "materialMovement.outwardContentRequired",
          path: ["materialName"],
        });
      }
      if (d.reminder) refineReminderFuture(d, ctx, opts);
    });
}

export const outwardMovementSchema = buildOutwardMovementSchema();

export function buildMaterialReturnSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      partyName: trimReq(120, "Party / supplier name is required."),
      materialName: trimReq(120, "Item name is required."),
      quantity: positiveNumber,
      unit: trimReq(40, "Unit is required."),
      returnReason: trimReq(200, "Reason is required."),
      fromLocation: trimOpt(200),
      toLocation: trimOpt(200),
      lrGrNumber: trimOpt(64),
      vehicleNumber: trimOpt(40),
      transporter: trimOpt(120),
      remarks: trimOpt(2000),
      reminder: reminderSchema,
      notes: trimOpt(5000),
      ...postalFormShape("dispatchFrom"),
      ...postalFormShape("deliveryTo"),
    })
    .superRefine((d, ctx) => {
      refineRecordDatePolicy("event_past_15", "entryDate", d.entryDate, ctx, {
        existingMs: existingMs(opts, "existingEntryDateMs"),
      });
      refinePostalPin(d as Record<string, unknown>, "dispatchFrom", ctx);
      refinePostalPin(d as Record<string, unknown>, "deliveryTo", ctx);
      refineRequiredPostalLine(
        d as Record<string, unknown>,
        "dispatchFrom",
        "fromLocation",
        ctx,
        "materialMovement.fromRequired"
      );
      refineRequiredPostalLine(
        d as Record<string, unknown>,
        "deliveryTo",
        "toLocation",
        ctx,
        "materialMovement.toRequired"
      );
      if (d.reminder) refineReminderFuture(d, ctx, opts);
    });
}

export function buildMaterialReceivedSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      supplierName: trimReq(120, "Supplier name is required."),
      materialName: trimReq(120, "Material name is required."),
      quantity: positiveNumber,
      unit: trimReq(40, "Unit is required."),
      invoiceBill: z.null().optional(),
      vehicleNumber: z.null().optional(),
      receivedLocation: trimOpt(200),
      checkedBy: z.null().optional(),
      qualityStatus: z.enum(["ok", "short", "damaged", "rejected", "pending_issue"]),
      issueNote: trimOpt(1000),
      paymentFollowUp: z.literal(false).default(false),
      reminder: z.null().optional(),
      notes: trimOpt(5000),
      ...postalFormShape("receivedAt"),
      ...postalFormShape("party"),
    })
    .superRefine((d, ctx) => {
      refineRecordDatePolicy("event_past_15", "entryDate", d.entryDate, ctx, {
        existingMs: existingMs(opts, "existingEntryDateMs"),
      });
      refinePostalPin(d as Record<string, unknown>, "receivedAt", ctx);
      refinePostalPin(d as Record<string, unknown>, "party", ctx);
    })
    .superRefine((d, ctx) => {
      if (d.qualityStatus !== "ok" && !d.issueNote) {
        ctx.addIssue({
          code: "custom",
          message: "Briefly describe the issue.",
          path: ["issueNote"],
        });
      }
    });
}

export const materialReceivedSchema = buildMaterialReceivedSchema();

export function buildReminderPurchaseSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      itemMaterial: trimReq(200, "What do you need to buy?"),
      reminder: reminderSchema.refine((r) => r != null, "When should we remind you?"),
      requiredQuantity: z.null().optional(),
      requiredByDate: z.null().optional(),
      vendor: z.null().optional(),
      estimatedAmount: z.null().optional(),
      priority: z.null().optional(),
      notes: trimOpt(5000),
    })
    .superRefine((d, ctx) => {
      if (d.reminder) refineReminderFuture(d, ctx, opts);
    });
}

export const reminderPurchaseSchema = buildReminderPurchaseSchema();

export function buildReminderEmailSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      purposeSubject: trimReq(200, "What is the email about?"),
      reminder: reminderSchema.refine((r) => r != null, "When should we remind you?"),
      recipientName: z.null().optional(),
      recipientEmail: z.null().optional(),
      relatedMatter: z.null().optional(),
      draftNotes: z.null().optional(),
      notes: trimOpt(5000),
    })
    .superRefine((d, ctx) => {
      if (d.reminder) refineReminderFuture(d, ctx, opts);
    });
}

export const reminderEmailSchema = buildReminderEmailSchema();

const optionalDate = z.preprocess(
  (v) => (v === null || v === undefined || v === "" ? null : Number(v)),
  z.number().int().positive().nullable()
);

export function buildPaymentRequestSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      partyName: trimReq(120, "Party / customer name is required."),
      invoiceNumber: trimReq(80, "Invoice / bill number is required."),
      invoiceDate: optionalDate,
      pendingAmount: inrAmountField,
      dueDate: optionalDate,
      contactPerson: trimOpt(120),
      requestNote: trimOpt(2000),
      includeBankDetailsInPdf: z.boolean().default(false),
      includePaymentPeriodInPdf: z.boolean().default(false),
      bankAccountHolder: trimOpt(120),
      bankName: trimOpt(120),
      bankAccountNumber: trimOpt(40),
      bankIfsc: trimOpt(16),
      bankUpiId: trimOpt(64),
      bankPaymentInstruction: trimOpt(300),
      ...postalFormShape("party"),
    })
    .superRefine((d, ctx) => {
      refineRecordDatePolicy("payment_request_created", "entryDate", d.entryDate, ctx, {
        existingMs: existingMs(opts, "existingEntryDateMs"),
      });
      if (d.invoiceDate != null) {
        refineRecordDatePolicy(
          "supporting_past_optional",
          "invoiceDate",
          d.invoiceDate,
          ctx,
          { existingMs: existingMs(opts, "existingInvoiceDateMs") }
        );
      }
      if (d.dueDate != null) {
        refineRecordDatePolicy("supporting_past_optional", "dueDate", d.dueDate, ctx, {
          existingMs: existingMs(opts, "existingDueDateMs"),
        });
      }
      refinePostalPin(d as Record<string, unknown>, "party", ctx);
      if (
        d.invoiceDate != null &&
        d.dueDate != null &&
        d.dueDate < d.invoiceDate
      ) {
        ctx.addIssue({
          code: "custom",
          message: "composer.paymentPeriodDueBeforeInvoice",
          path: ["dueDate"],
        });
      }
      if (!d.includeBankDetailsInPdf) return;
      const ifsc = (d.bankIfsc ?? "").trim();
      if (ifsc && !isValidIfsc(ifsc)) {
        ctx.addIssue({
          code: "custom",
          message: "composer.bankIfscInvalid",
          path: ["bankIfsc"],
        });
      }
      const upi = (d.bankUpiId ?? "").trim();
      if (upi && !isValidUpiId(upi)) {
        ctx.addIssue({
          code: "custom",
          message: "composer.bankUpiInvalid",
          path: ["bankUpiId"],
        });
      }
    })
    .transform((d) => {
      const unchangedRequest =
        opts?.existingEntryDateMs != null &&
        validateRecordDate("payment_request_created", d.entryDate, {
          existingMs: opts.existingEntryDateMs,
        }) === null;
      const entryDate = unchangedRequest
        ? d.entryDate
        : paymentRequestCreatedDateMs();
      return { ...d, entryDate };
    });
}

export const paymentRequestSchema = buildPaymentRequestSchema();

const positiveInt = z.preprocess(
  (val) => {
    if (val === "" || val === undefined || val === null) return NaN;
    return typeof val === "number" ? Math.floor(val) : Math.floor(Number(val));
  },
  z.number().int().positive("Total boxes must be greater than 0.")
);

const positiveWeight = z.preprocess(
  (val) => {
    if (val === "" || val === undefined || val === null) return NaN;
    return typeof val === "number" ? val : Number(val);
  },
  z.number().positive("Enter total weight greater than zero.")
);

export function buildOutwardFreightSchema(opts?: DatePolicySchemaOptions) {
  return z
    .object({
      title: z.string().trim().max(120).optional(),
      entryDate: z.number().int().positive(),
      dispatchTitle: trimOpt(120),
      billNumber: trimReq(80, "Bill / challan / invoice number is required."),
      billDate: optionalDate,
      lrGrNumber: trimOpt(64),
      deliveryLocation: trimOpt(200),
      dispatchFromLocation: trimOpt(200),
      totalBoxes: positiveInt,
      totalWeight: positiveWeight,
      weightUnit: z.string().trim().max(12).default("Kg"),
      freightType: z.enum(["to_pay", "paid", "tbb", "other"]),
      transporterName: trimOpt(120),
      vehicleNumber: trimOpt(40),
      ccCopyInstruction: z.enum(["attach", "not_attached", "not_applicable"]),
      clarificationContactName: trimReq(120, "Clarification contact name is required."),
      clarificationContactMobile: z
        .string()
        .trim()
        .min(10, "Clarification mobile is required.")
        .max(15)
        .refine((s) => /^[0-9+\-\s]{10,15}$/.test(s), "Enter a valid mobile number."),
      remarks: trimOpt(2000),
      partyName: trimOpt(120),
      materialName: trimOpt(120),
      linkedDispatchId: trimOpt(64),
      linkedDispatchUpdatedAt: z.number().int().positive().nullable().optional(),
      reminder: reminderSchema,
      notes: trimOpt(5000),
      ...postalFormShape("deliveryTo"),
      ...postalFormShape("dispatchFrom"),
    })
    .superRefine((d, ctx) => {
      if (d.billDate != null) {
        refineRecordDatePolicy("freight_event", "billDate", d.billDate, ctx, {
          existingMs: existingMs(opts, "existingBillDateMs"),
        });
      } else {
        refineRecordDatePolicy("freight_event", "entryDate", d.entryDate, ctx, {
          existingMs: existingMs(opts, "existingEntryDateMs"),
        });
      }
      refinePostalPin(d as Record<string, unknown>, "deliveryTo", ctx);
      refinePostalPin(d as Record<string, unknown>, "dispatchFrom", ctx);
      refineRequiredPostalLine(
        d as Record<string, unknown>,
        "deliveryTo",
        "deliveryLocation",
        ctx,
        "composer.deliveryRequired"
      );
      if (d.reminder) refineReminderFuture(d, ctx, opts);
    });
}

export const outwardFreightSchema = buildOutwardFreightSchema();

export function getSchemaForType(
  type: BusinessEntryType,
  options?: DatePolicySchemaOptions
) {
  switch (type) {
    case "work_update_issue":
      return buildWorkUpdateSchema(options);
    case "staff_matter":
      return buildStaffMatterSchema(options);
    case "business_cash_given":
      return buildCashGivenSchema(options?.existingCashPaidDateMs);
    case "material_dispatched":
    case "outward_freight_details":
      return buildOutwardMovementSchema(options);
    case "material_received":
      return buildMaterialReceivedSchema(options);
    case "material_return":
      return buildMaterialReturnSchema(options);
    case "payment_request":
      return buildPaymentRequestSchema(options);
    case "reminder_purchase":
      return buildReminderPurchaseSchema(options);
    case "reminder_email":
      return buildReminderEmailSchema(options);
    default:
      return null;
  }
}
