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
import { markPdfRevisionReady } from "@/services/pdf/pdfRevisionGate";

function askPhotoRecovery(
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<"retry" | "without_photo" | "cancel"> {
  return new Promise((resolve) => {
    Alert.alert(
      t("composer.cashPaidPdfPhotoUnavailable"),
      t("composer.cashPaidPdfNotReady"),
      [
        { text: t("composer.cashPaidPdfRetry"), onPress: () => resolve("retry") },
        {
          text: t("composer.cashPaidPdfWithoutPhoto"),
          onPress: () => resolve("without_photo"),
        },
        { text: t("common.cancel"), style: "cancel", onPress: () => resolve("cancel") },
      ],
      { cancelable: true, onDismiss: () => resolve("cancel") }
    );
  });
}

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

  let allowWithoutPhoto = false;
  let rendered: Awaited<ReturnType<typeof generateCashPaidVoucherPdf>> | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    rendered = await generateCashPaidVoucherPdf({
      entry: workingEntry,
      user: options.user,
      mode,
      t: options.t,
      uiLang: options.uiLang,
      allowWithoutPhoto,
    });
    if (rendered.status === "ready") break;
    const choice = await askPhotoRecovery(options.t);
    if (choice === "cancel") return entry;
    allowWithoutPhoto = choice === "without_photo";
  }
  if (!rendered || rendered.status !== "ready") return entry;

  const { html, fileName } = rendered;
  const pdf = await pdfService.generate({
    html,
    fileNameHint: buildPdfFileName(fileName).replace(/\.pdf$/, ""),
    fileName,
  });
  if (!rendered.photoOmitted) {
    markPdfRevisionReady(workingEntry.id, rendered.documentRevision);
  }
  const withPdf = mergeEntryPdfGeneration(workingEntry, pdf.uri);
  const saved = await getDiaryRepository().update(userId, {
    id: entry.id,
    pdfUri: withPdf.pdfUri,
  });

  await pdfService.share(pdf);

  return saved;
}
