import { Alert } from "react-native";

import type { BusinessCashGivenPayload, BusinessEntry } from "@/domain/businessEntry";
import type { UserProfile } from "@/domain/types";
import type { Lang } from "@/i18n/types";
import { allocateCashPaidVoucherSerial } from "@/services/cashPaid";
import { mergeEntryPdfGeneration } from "@/services/diary/mergeEntryUpdate";
import { getDiaryRepository } from "@/services/diary/index";
import {
  generateCashPaidVoucherPdf,
  type CashPaidPdfMode,
} from "@/services/pdf/cashPaidPdfService";
import { buildPdfFileName } from "@/services/pdf/pdfFileNames";
import { pdfService } from "@/services/pdf/pdfService";

function pickCashPaidPdfMode(): Promise<CashPaidPdfMode | null> {
  return new Promise((resolve) => {
    Alert.alert(
      "Export Cash Payment Voucher",
      "Choose the PDF format for this cash payment record.",
      [
        { text: "Field Voucher", onPress: () => resolve("fieldVoucher") },
        { text: "Full Legal Record", onPress: () => resolve("fullLegalRecord") },
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}

export async function exportCashPaidPdf(
  userId: string,
  entry: BusinessEntry,
  options: {
    user: UserProfile;
    uiLang?: Lang;
    t: (key: string, vars?: Record<string, string | number>) => string;
  }
): Promise<BusinessEntry> {
  if (entry.entryType !== "business_cash_given") {
    throw new Error("exportCashPaidPdf requires a business_cash_given entry.");
  }

  const mode = await pickCashPaidPdfMode();
  if (!mode) {
    return entry;
  }

  const payload = entry.payload as BusinessCashGivenPayload;

  const paymentDateMs = payload.paymentDate ?? entry.entryDate;
  const allocation = await allocateCashPaidVoucherSerial(
    userId,
    paymentDateMs,
    payload.cashPaidVoucherSerial
  );

  const nextPayload: BusinessCashGivenPayload = {
    ...payload,
    cashPaidVoucherSerial: allocation.serial,
    cashPaidVoucherSerialYear: allocation.yearLabel,
    cashPaidVoucherSerialAllocatedAt:
      payload.cashPaidVoucherSerialAllocatedAt ?? allocation.allocatedAt,
  };

  let workingEntry = entry;
  const serialChanged =
    payload.cashPaidVoucherSerial !== nextPayload.cashPaidVoucherSerial ||
    payload.cashPaidVoucherSerialYear !== nextPayload.cashPaidVoucherSerialYear;

  if (serialChanged) {
    workingEntry = await getDiaryRepository().update(userId, {
      id: entry.id,
      payload: nextPayload,
    });
  } else {
    workingEntry = { ...entry, payload: nextPayload };
  }

  const { html, fileName } = await generateCashPaidVoucherPdf({
    entry: workingEntry,
    user: options.user,
    mode,
    t: options.t,
    uiLang: options.uiLang,
  });

  const pdf = await pdfService.generate({
    html,
    fileNameHint: buildPdfFileName(fileName).replace(/\.pdf$/, ""),
    fileName,
  });
  const withPdf = mergeEntryPdfGeneration(workingEntry, pdf.uri);
  const saved = await getDiaryRepository().update(userId, {
    id: entry.id,
    pdfUri: withPdf.pdfUri,
  });

  await pdfService.share(pdf);

  return saved;
}
