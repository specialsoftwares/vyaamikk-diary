import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import type { BusinessEntry } from "@/domain/businessEntry";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formatEntryDate } from "@/utils/date";
import { formatINRWithWords, inrWordsLocaleFromLang } from "@/utils/money/inrWords";
import { useT, useI18n } from "@/i18n";
import { entryListSummary } from "@/utils/businessEntry/display";
import { entryHasGpsFootprint, manualLocationTextFromEntry } from "@/utils/location/entryLocation";
import { Button } from "@/components/ui";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { cashPaidPhotoAttachment } from "@/services/attachments/cashPaidPhotoService";
import { formatReceiverMobileForPdf } from "@/utils/phone/receiverMobile";

export function BusinessEntryDetailBody({
  entry,
  onRemoveGps,
  removingGps,
}: {
  entry: BusinessEntry;
  onRemoveGps?: () => void;
  removingGps?: boolean;
}) {
  const t = useT();
  const { lang } = useI18n();
  const amountLocale = inrWordsLocaleFromLang(lang);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      summary: { ...typography.body, color: c.textMuted, marginBottom: spacing.md },
      field: { gap: 2, marginBottom: spacing.sm },
      label: { ...typography.captionStrong, color: c.textMuted },
      value: { ...typography.body, color: c.text },
    })
  );

  const p = entry.payload as unknown as Record<string, unknown>;
  const Field = ({ label, value }: { label: string; value?: string | null }) => {
    if (value == null || String(value).trim() === "") return null;
    return (
      <View style={styles.field}>
        <LocaleUiText style={styles.label}>{label}</LocaleUiText>
        <Text style={styles.value} selectable>
          {String(value)}
        </Text>
      </View>
    );
  };

  const rows: React.ReactNode[] = [];

  switch (entry.entryType) {
    case "work_update_issue":
      rows.push(
        <Field key="w" label={t("composer.workDone")} value={p.workDone as string} />,
        <Field key="i" label={t("composer.followUpNote")} value={p.issueProblem as string} />,
        <Field key="s" label={t("composer.sitePlace")} value={p.sitePlace as string} />
      );
      break;
    case "staff_matter":
      rows.push(
        <Field key="n" label={t("composer.staffName")} value={p.staffName as string} />,
        <Field key="d" label={t("composer.matterDetails")} value={p.matterDetails as string} />,
        <Field key="t" label={t("composer.matterType")} value={p.matterType as string} />
      );
      break;
    case "business_cash_given": {
      const paidMs =
        p.paymentDate != null && Number(p.paymentDate) > 0
          ? Number(p.paymentDate)
          : entry.entryDate;
      rows.push(
        <Field
          key="paid"
          label={t("composer.cashPaidDate")}
          value={formatEntryDate(paidMs)}
        />,
        <Field
          key="rec"
          label={t("composer.recordedOn")}
          value={formatEntryDate(entry.createdAt)}
        />,
        <Field
          key="a"
          label={t("composer.amount")}
          value={formatINRWithWords(Number(p.amount), amountLocale)}
        />,
        <Field key="g" label={t("composer.givenToName")} value={p.givenToName as string} />
      );
      if (p.receiverMobile) {
        rows.push(
          <Field
            key="rm"
            label={t("cashPaid.receiverMobile.label")}
            value={formatReceiverMobileForPdf(String(p.receiverMobile))}
          />
        );
      }
      rows.push(
        <Field key="p" label={t("composer.purpose")} value={p.purpose as string} />,
        <Field key="m" label={t("composer.paymentMode")} value="Cash" />
      );
      if (p.settlementStatus && p.settlementStatus !== "pending") {
        rows.push(
          <Field
            key="s"
            label={t("composer.settlementStatus")}
            value={p.settlementStatus as string}
          />
        );
      }
      const cashPhoto = cashPaidPhotoAttachment(entry.attachments);
      if (cashPhoto?.uri) {
        rows.push(
          <View key="photo" style={styles.field}>
            <LocaleUiText style={styles.label}>{t("composer.cashPaidPhotoLabel")}</LocaleUiText>
            <Image
              source={{ uri: cashPhoto.uri }}
              style={{ width: 96, height: 72, borderRadius: 8 }}
              resizeMode="cover"
            />
          </View>
        );
      }
      break;
    }
    case "material_dispatched":
      rows.push(
        <Field key="pa" label={t("composer.partyName")} value={p.partyName as string} />,
        <Field key="m" label={t("composer.materialName")} value={p.materialName as string} />,
        <Field key="q" label={t("composer.quantity")} value={`${p.quantity} ${p.unit}`} />,
        <Field key="inv" label={t("composer.invoiceChallan")} value={p.invoiceChallan as string} />,
        <Field key="dest" label={t("composer.destination")} value={p.destination as string} />,
        <Field key="v" label={t("composer.vehicleNumber")} value={p.vehicleNumber as string} />
      );
      break;
    case "payment_request":
      rows.push(
        <Field key="pa" label={t("composer.partyName")} value={p.partyName as string} />,
        <Field key="inv" label={t("composer.invoiceNumber")} value={p.invoiceNumber as string} />,
        <Field
          key="pe"
          label={t("composer.pendingAmount")}
          value={formatINRWithWords(Number(p.pendingAmount), amountLocale)}
        />
      );
      if (p.invoiceDate) {
        rows.push(
          <Field
            key="id"
            label={t("composer.invoiceDate")}
            value={formatEntryDate(Number(p.invoiceDate))}
          />
        );
      }
      if (p.dueDate) {
        rows.push(
          <Field key="dd" label={t("composer.dueDate")} value={formatEntryDate(Number(p.dueDate))} />
        );
      }
      if (p.contactPerson) {
        rows.push(
          <Field key="cp" label={t("composer.contactPerson")} value={p.contactPerson as string} />
        );
      }
      if (p.requestNote) {
        rows.push(
          <Field key="rn" label={t("composer.requestNote")} value={p.requestNote as string} />
        );
      }
      if (p.includeBankDetailsInPdf && p.bankDetails) {
        const b = p.bankDetails as Record<string, unknown>;
        rows.push(
          <Field key="bh" label={t("composer.bankAccountHolder")} value={b.accountHolderName as string} />,
          <Field key="bn" label={t("composer.bankName")} value={b.bankName as string} />
        );
      }
      break;
    case "outward_freight_details":
      rows.push(
        <Field key="bt" label={t("composer.billNumber")} value={p.billNumber as string} />,
        <Field key="dl" label={t("composer.deliveryLocation")} value={p.deliveryLocation as string} />,
        <Field key="bx" label={t("composer.totalBoxes")} value={String(p.totalBoxes)} />,
        <Field key="wt" label={t("composer.totalWeight")} value={`${p.totalWeight} ${p.weightUnit}`} />,
        <Field
          key="ft"
          label={t("composer.freightType")}
          value={t(`composer.freightTypes.${p.freightType as string}`)}
        />
      );
      break;
    case "material_received":
      rows.push(
        <Field key="su" label={t("composer.supplierName")} value={p.supplierName as string} />,
        <Field key="m" label={t("composer.materialName")} value={p.materialName as string} />,
        <Field key="q" label={t("composer.qualityStatus")} value={p.qualityStatus as string} />,
        <Field key="in" label={t("composer.issueNote")} value={p.issueNote as string} />
      );
      break;
    case "reminder_purchase":
      rows.push(
        <Field key="it" label={t("composer.itemMaterial")} value={p.itemMaterial as string} />
      );
      break;
    case "reminder_email":
      rows.push(
        <Field key="ps" label={t("composer.purposeSubject")} value={p.purposeSubject as string} />
      );
      break;
    case "reminder_gst_return":
      rows.push(
        <Field key="rt" label={t("composer.returnType")} value={p.returnType as string} />,
        <Field key="tp" label={t("composer.taxPeriod")} value={p.taxPeriod as string} />,
        <Field key="dd" label={t("composer.dueDate")} value={formatEntryDate(Number(p.dueDate))} />
      );
      break;
    case "letterhead_matter":
      rows.push(
        <Field key="b" label={t("letterhead.fieldBody")} value={p.body as string} />,
        <Field key="sub" label={t("letterhead.fieldSubject")} value={p.subject as string} />
      );
      break;
    case "legacy":
    default:
      rows.push(
        <Field key="c" label={t("pdf.entryCategory")} value={p.category as string} />,
        <Field key="q" label={t("diary.field.quantity")} value={p.quantity as string} />,
        <Field key="i" label={t("diary.field.issue")} value={p.issue as string} />
      );
  }

  return (
    <>
      <Text style={styles.summary}>{entryListSummary(entry, t)}</Text>
      {rows}
      {manualLocationTextFromEntry(entry) ? (
        <Field label={t("diary.field.location")} value={manualLocationTextFromEntry(entry)} />
      ) : null}
      {entryHasGpsFootprint(entry.location) ? (
        <>
          <Field
            label={t("calendarMaps.location.gpsAttached")}
            value={
              entry.location?.gps?.addressLabel?.trim() ||
              t("calendarMaps.location.gpsGeneric")
            }
          />
          {onRemoveGps ? (
            <Button
              label={t("calendarMaps.location.removeGps")}
              variant="ghost"
              size="md"
              loading={removingGps}
              onPress={onRemoveGps}
            />
          ) : null}
        </>
      ) : null}
      {entry.notes ? <Field label={t("composer.fieldNotes")} value={entry.notes} /> : null}
    </>
  );
}
