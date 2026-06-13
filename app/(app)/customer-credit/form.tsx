/**
 * Customer Credit / EMI create / edit form.
 *
 *   • No `id` param → create a new record (serial allocated on save).
 *   • `id` param    → edit an existing record (record number + created date
 *                     fixed; only the modified date advances).
 *
 * Record-keeping only — no lending / KYC / loan language. Customer ID document
 * details and an optional, consent-based customer photo may be attached; the
 * photo stays on this device only and is never synced or shared across users.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Banner,
  Button,
  FormSection,
  Header,
  Loader,
  Screen,
  SelectField,
  TextField,
  type SelectOption, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { formDateRowStyle, formFieldLabelStyle, formNestedCardStyle } from "@/theme/formLayer";
import { spacing, typography, useTheme, useThemeColors, useThemedStyles } from "@/theme";
import { userFacingMessage } from "@/domain/errors";
import { formatShortDate } from "@/utils/date";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { requestComposerPickerReturn } from "@/navigation";
import {
  computeChargesBreakdown,
  computeProductsTotal,
  CREDIT_MAX_INSTALMENTS,
  CREDIT_MAX_PRODUCTS,
  generateEmiSchedule,
  isPaidInFull,
  isSaleDateAllowed,
  isFirstDueDateAllowed,
  maxFirstDueDate,
  minFirstDueDate,
  normalizeCreditCalendarDay,
  modeUsesExternalFinance,
  modeUsesSchedule,
  type CreditChargesConfig,
  type CreditChargesMode,
  type CreditPaymentMode,
  type CustomerCreditMode,
  type CustomerCreditProduct,
  type CustomerCreditRecord,
  type CustomerDocumentType,
  type EmiFrequency,
} from "@/domain/customerCredit";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import {
  CustomerPhotoError,
  persistCustomerPhoto,
  pickCustomerPhoto,
  removeCustomerPhotoFile,
  type PickedCustomerPhoto,
} from "@/services/customerCredit/customerPhotoService";
import { pdfService } from "@/services/pdf/pdfService";
import {
  isValidIndianPincode,
  normalizeIndianPinInput,
  resolveIndianPincode,
} from "@/services/location/pincodeResolver";
import { normalizeIndianMobile } from "@/utils/phone";
import { isValidPan, normalizePan } from "@/utils/pan/pan";
import { formatINRInWords } from "@/utils/money/inrWords";
import { saveCustomerCreditWithPdf } from "@/services/customerCredit/saveWithPdf";
import { logSaveDiagnostic } from "@/services/records/saveDiagnostics";
import { useFormFieldNavigation } from "@/components/inputSafety/FormFocusManager";
import { buildCustomerCreditNavOrder } from "@/utils/formFieldNavigation/fieldNavOrders";
import { SaveStillInProgressError } from "@/services/records/saveLockTypes";
import {
  createSaveIdempotencyContext,
  generateClientRecordId,
  type SaveIdempotencyContext,
} from "@/services/records/saveIdempotency";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[6-9]\d{9}$/;

interface ProductDraft {
  productName: string;
  brandModel: string;
  serialImei: string;
  saleAmount: string;
  invoiceNumber: string;
}

function emptyProduct(): ProductDraft {
  return { productName: "", brandModel: "", serialImei: "", saleAmount: "", invoiceNumber: "" };
}

function toNumber(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Strip a stored +91 prefix back to the 10 local digits for display. */
function localDigits(stored: string | null | undefined): string {
  if (!stored) return "";
  const d = stored.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 10) return d;
  return d.slice(-10);
}

export default function CustomerCreditFormScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const c = useThemeColors();
  const { user } = useAuth();
  const { id: editId, fromPicker } = useLocalSearchParams<{ id?: string; fromPicker?: string }>();
  const isEditing = Boolean(editId);
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";

  const styles = useThemedStyles((cc) =>
    StyleSheet.create({
      lead: { ...typography.body, color: cc.textMuted, marginBottom: spacing.md },
      banner: { marginBottom: spacing.md },
      sectionGap: { marginTop: spacing.md },
      fieldLabel: formFieldLabelStyle(cc),
      infoNote: { ...typography.caption, color: cc.textSubtle, marginTop: 2 },
      consentNote: { ...typography.caption, color: cc.textSubtle, marginTop: spacing.xs },
      resolved: { ...typography.caption, color: cc.success, marginTop: 2 },
      linkText: { ...typography.captionStrong, color: cc.primary, marginTop: spacing.xs },
      dateRow: formDateRowStyle(isDark, cc),
      dateValue: { ...typography.body, color: cc.text },
      dateChange: { ...typography.caption, color: cc.primary },
      switchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
        paddingVertical: spacing.xs,
      },
      switchLabel: { ...typography.body, color: cc.text, flex: 1 },
      photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
      photoThumb: { width: 56, height: 72, borderRadius: 8, backgroundColor: cc.surfaceMuted },
      photoActions: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
      itemCard: formNestedCardStyle(isDark, cc),
      itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
      itemTitle: { ...typography.captionStrong, color: cc.text },
      itemRemove: { ...typography.caption, color: cc.danger },
      row2: { flexDirection: "row", gap: spacing.sm },
      col: { flex: 1 },
      totalRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: spacing.sm,
        paddingTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: cc.divider,
      },
      totalLabel: { ...typography.titleSm, color: cc.text },
      totalValue: { ...typography.titleSm, color: cc.primary },
      wordsText: { ...typography.caption, color: cc.textMuted, marginTop: spacing.xs },
      schedulePreview: {
        marginTop: spacing.sm,
        gap: 2,
        padding: spacing.sm,
        borderRadius: 10,
        backgroundColor: cc.surfaceMuted,
      },
      scheduleRow: { flexDirection: "row", justifyContent: "space-between" },
      scheduleText: { ...typography.caption, color: cc.textMuted },
      actions: { gap: spacing.sm, marginTop: spacing.lg },
    })
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const saveLockRef = useRef(false);
  const clientRecordIdRef = useRef(
    editId ? String(editId) : generateClientRecordId("cr")
  );
  const paidInFullPaymentIdRef = useRef(generateClientRecordId("pay"));
  const idempotencyRef = useRef<SaveIdempotencyContext | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [existing, setExisting] = useState<CustomerCreditRecord | null>(null);

  const [mode, setMode] = useState<CustomerCreditMode>("credit");
  const [saleDate, setSaleDate] = useState<number>(Date.now());

  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerAltContact, setCustomerAltContact] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [locality, setLocality] = useState("");
  const [city, setCity] = useState("");
  const [customerState, setCustomerState] = useState("");
  const [customerPin, setCustomerPin] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [showFullAddress, setShowFullAddress] = useState(false);
  const [pinResolved, setPinResolved] = useState<string | null>(null);

  // Photo
  const [existingPhoto, setExistingPhoto] = useState<CustomerCreditRecord["customerPhoto"]>(null);
  const [pickedPhoto, setPickedPhoto] = useState<PickedCustomerPhoto | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  // Document
  const [documentType, setDocumentType] = useState<CustomerDocumentType | "">("");
  const [documentReference, setDocumentReference] = useState("");

  const [products, setProducts] = useState<ProductDraft[]>([emptyProduct()]);

  const [downPayment, setDownPayment] = useState("");
  const [paidMode, setPaidMode] = useState<CreditPaymentMode>("cash");
  const [paidReference, setPaidReference] = useState("");

  // Charges
  const [chargesMode, setChargesMode] = useState<CreditChargesMode>("none");
  const [chargesAmount, setChargesAmount] = useState("");
  const [chargesLabel, setChargesLabel] = useState("");
  const [interestPercent, setInterestPercent] = useState("");
  const [processingPercent, setProcessingPercent] = useState("");
  const [processingAmount, setProcessingAmount] = useState("");
  const [chargesBase, setChargesBase] = useState<"principal" | "sale">("principal");
  const [processingUpfront, setProcessingUpfront] = useState(false);
  const [financeProvided, setFinanceProvided] = useState(false);

  const [emiCount, setEmiCount] = useState("");
  const [emiFrequency, setEmiFrequency] = useState<EmiFrequency>("monthly");
  const [customIntervalDays, setCustomIntervalDays] = useState("");
  const [firstDueDate, setFirstDueDate] = useState<number | null>(null);

  const [financerName, setFinancerName] = useState("");
  const [financeRefNumber, setFinanceRefNumber] = useState("");
  const [financeDownPayment, setFinanceDownPayment] = useState("");
  const [financeAmount, setFinanceAmount] = useState("");
  const [shopFollowUpRequired, setShopFollowUpRequired] = useState(false);

  const [idConsent, setIdConsent] = useState(false);
  const [guarantorName, setGuarantorName] = useState("");
  const [remarks, setRemarks] = useState("");

  const customerPinResolved = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      if (editId) {
        const rec = await getCustomerCreditRepository().getById(user.uid, String(editId));
        if (rec) {
          setExisting(rec);
          setMode(rec.mode);
          setSaleDate(rec.saleDate);
          setCustomerName(rec.customerName);
          setCustomerMobile(localDigits(rec.customerMobile));
          setCustomerAltContact(localDigits(rec.customerAltContact));
          setAddressLine(rec.customerAddress ?? "");
          setLocality(rec.customerLocality ?? "");
          setCity(rec.customerCity ?? "");
          setCustomerState(rec.customerState ?? "");
          setCustomerPin(rec.customerPin ?? "");
          setCustomerEmail(rec.customerEmail ?? "");
          setShowFullAddress(Boolean(rec.customerAddress || rec.customerLocality));
          setExistingPhoto(rec.customerPhoto ?? null);
          setDocumentType(rec.documentType ?? "");
          setDocumentReference(rec.documentReference ?? "");
          setProducts(
            rec.products.length
              ? rec.products.map((p) => ({
                  productName: p.productName,
                  brandModel: p.brandModel ?? "",
                  serialImei: p.serialImei ?? "",
                  saleAmount: p.saleAmount ? String(p.saleAmount) : "",
                  invoiceNumber: p.invoiceNumber ?? "",
                }))
              : [emptyProduct()]
          );
          setDownPayment(rec.downPayment != null ? String(rec.downPayment) : "");
          const ch = rec.charges;
          if (ch && ch.mode !== "none") {
            setChargesMode(ch.mode);
            setChargesBase(ch.base === "sale" ? "sale" : "principal");
            setChargesAmount(ch.fixedAmount != null ? String(ch.fixedAmount) : "");
            setChargesLabel(ch.fixedLabel ?? ch.customLabel ?? "");
            setInterestPercent(ch.interestPercent != null ? String(ch.interestPercent) : "");
            setProcessingPercent(ch.processingPercent != null ? String(ch.processingPercent) : "");
            setProcessingAmount(ch.processingAmount != null ? String(ch.processingAmount) : "");
            setProcessingUpfront(ch.processingUpfront === true);
            setFinanceProvided(ch.financeProvided === true);
            if (ch.mode === "custom") setChargesAmount(ch.customAmount != null ? String(ch.customAmount) : "");
          }
          setEmiCount(rec.emiCount != null ? String(rec.emiCount) : "");
          setEmiFrequency(rec.emiFrequency ?? "monthly");
          setCustomIntervalDays(rec.customIntervalDays != null ? String(rec.customIntervalDays) : "");
          setFirstDueDate(rec.firstDueDate ?? null);
          setFinancerName(rec.financerName ?? "");
          setFinanceRefNumber(rec.financeRefNumber ?? "");
          setFinanceDownPayment(rec.financeDownPayment != null ? String(rec.financeDownPayment) : "");
          setFinanceAmount(rec.financeAmount != null ? String(rec.financeAmount) : "");
          setShopFollowUpRequired(rec.shopFollowUpRequired ?? false);
          setIdConsent(Boolean(rec.idAttachmentConsentAt));
          setGuarantorName(rec.guarantorName ?? "");
          setRemarks(rec.remarks ?? "");
        }
      }
    } catch (e) {
      setLoadError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, editId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!user || isEditing) return;
    idempotencyRef.current = createSaveIdempotencyContext({
      userId: user.uid,
      recordKind: "customer_credit",
      clientRecordId: clientRecordIdRef.current,
    });
  }, [user, isEditing]);

  // Best-effort: resolve city/state from PIN (don't re-ask once resolved).
  useEffect(() => {
    const pin = normalizeIndianPinInput(customerPin);
    if (!isValidIndianPincode(pin) || customerPinResolved.current === pin) return;
    customerPinResolved.current = pin;
    void resolveIndianPincode(pin).then((r) => {
      if (r.success) {
        if (r.state) setCustomerState((prev) => prev.trim() || r.state || prev);
        if (r.district) setCity((prev) => prev.trim() || r.district || prev);
        const place = [r.district, r.state].filter(Boolean).join(", ");
        setPinResolved(place ? `${place} - ${pin}` : null);
      } else {
        setPinResolved(null);
      }
    });
  }, [customerPin]);

  const cleanProducts: CustomerCreditProduct[] = useMemo(
    () =>
      products
        .filter((p) => p.productName.trim() && toNumber(p.saleAmount) > 0)
        .slice(0, CREDIT_MAX_PRODUCTS)
        .map((p) => ({
          productName: p.productName.trim(),
          brandModel: p.brandModel.trim() || null,
          serialImei: p.serialImei.trim() || null,
          saleAmount: toNumber(p.saleAmount),
          invoiceNumber: p.invoiceNumber.trim() || null,
        })),
    [products]
  );

  const saleTotal = useMemo(() => computeProductsTotal(cleanProducts), [cleanProducts]);
  const paidInFull = isPaidInFull(mode);
  const usesSchedule = modeUsesSchedule(mode);
  const usesFinance = modeUsesExternalFinance(mode);

  const financeAmt = useMemo(
    () => (usesFinance ? toNumber(financeAmount) : 0),
    [usesFinance, financeAmount]
  );

  // For mixed, the shop-managed slice is sale − down − externally financed.
  const principalBalance = useMemo(
    () => Math.max(0, saleTotal - toNumber(downPayment) - (mode === "mixed" ? financeAmt : 0)),
    [saleTotal, downPayment, mode, financeAmt]
  );

  const chargesConfig: CreditChargesConfig | null = useMemo(() => {
    if (chargesMode === "none") return null;
    return {
      mode: chargesMode,
      base: chargesBase,
      fixedAmount: chargesMode === "fixed" ? toNumber(chargesAmount) : null,
      fixedLabel: chargesMode === "fixed" ? chargesLabel.trim() || null : null,
      interestPercent:
        chargesMode === "interest_pct" || chargesMode === "interest_plus_processing"
          ? toNumber(interestPercent)
          : null,
      processingPercent:
        chargesMode === "processing_pct" || chargesMode === "interest_plus_processing"
          ? toNumber(processingPercent)
          : null,
      processingAmount:
        (chargesMode === "processing_pct" || chargesMode === "interest_plus_processing") &&
        processingAmount.trim()
          ? toNumber(processingAmount)
          : null,
      processingUpfront,
      customLabel: chargesMode === "custom" ? chargesLabel.trim() || null : null,
      customAmount: chargesMode === "custom" ? toNumber(chargesAmount) : null,
      financeProvided: usesFinance ? financeProvided : false,
    };
  }, [
    chargesMode,
    chargesBase,
    chargesAmount,
    chargesLabel,
    interestPercent,
    processingPercent,
    processingAmount,
    processingUpfront,
    financeProvided,
    usesFinance,
  ]);

  const chargesBreakdown = useMemo(
    () => computeChargesBreakdown(chargesConfig, principalBalance, saleTotal),
    [chargesConfig, principalBalance, saleTotal]
  );

  const schedule = useMemo(() => {
    if (!usesSchedule) return [];
    const count = Math.floor(toNumber(emiCount));
    if (count < 1 || !firstDueDate || !isFirstDueDateAllowed(firstDueDate, saleDate) || principalBalance <= 0)
      return [];
    return generateEmiSchedule({
      balancePrincipal: principalBalance,
      interestCharges: chargesBreakdown.financedCharges,
      emiCount: count,
      frequency: emiFrequency,
      firstDueDate,
      customIntervalDays: toNumber(customIntervalDays),
    });
  }, [
    usesSchedule,
    emiCount,
    firstDueDate,
    principalBalance,
    chargesBreakdown.financedCharges,
    emiFrequency,
    customIntervalDays,
  ]);

  const totalPayable = useMemo(
    () => (usesSchedule ? principalBalance + chargesBreakdown.financedCharges : null),
    [usesSchedule, principalBalance, chargesBreakdown.financedCharges]
  );

  const firstDueMinMs = useMemo(() => minFirstDueDate(saleDate), [saleDate]);
  const firstDueMaxMs = useMemo(() => maxFirstDueDate(saleDate), [saleDate]);
  const firstDuePickerDate = useMemo(() => {
    if (firstDueDate != null && isFirstDueDateAllowed(firstDueDate, saleDate)) {
      return new Date(firstDueDate);
    }
    return new Date(firstDueMinMs);
  }, [firstDueDate, saleDate, firstDueMinMs]);

  useEffect(() => {
    if (firstDueDate == null) return;
    if (!isFirstDueDateAllowed(firstDueDate, saleDate)) {
      setFirstDueDate(null);
    }
  }, [saleDate, firstDueDate]);

  const fmtMoney = useCallback((v: number) => formatAmount(v), []);

  const updateProduct = useCallback((idx: number, patch: Partial<ProductDraft>) => {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }, []);
  const addProduct = useCallback(
    () => setProducts((prev) => (prev.length >= CREDIT_MAX_PRODUCTS ? prev : [...prev, emptyProduct()])),
    []
  );
  const removeProduct = useCallback(
    (idx: number) =>
      setProducts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))),
    []
  );

  const onPickPhoto = useCallback(
    async (source: "camera" | "library") => {
      try {
        const picked = await pickCustomerPhoto(source);
        if (picked) {
          setPickedPhoto(picked);
          setPhotoRemoved(false);
        }
      } catch (e) {
        if (e instanceof CustomerPhotoError) {
          const key =
            e.code === "too_large"
              ? "customerCredit.photoTooLarge"
              : e.code === "permission"
                ? "customerCredit.photoPermission"
                : "customerCredit.photoFailed";
          setSubmitError(t(key));
        }
      }
    },
    [t]
  );

  const promptPhoto = useCallback(() => {
    Alert.alert(t("customerCredit.photoAdd"), undefined, [
      { text: t("customerCredit.photoCamera"), onPress: () => void onPickPhoto("camera") },
      { text: t("customerCredit.photoLibrary"), onPress: () => void onPickPhoto("library") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [t, onPickPhoto]);

  const removePhoto = useCallback(() => {
    setPickedPhoto(null);
    setPhotoRemoved(true);
  }, []);

  const photoUri = pickedPhoto?.uri ?? (!photoRemoved ? existingPhoto?.localUri : null) ?? null;

  const goBack = useCallback(() => {
    if (fromPicker === "1") requestComposerPickerReturn("picker");
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/saved-records");
  }, [fromPicker, router]);

  const onSubmit = useCallback(async () => {
    if (!user) return;
    if (submitting || saveLockRef.current) return;

    if (!customerName.trim()) return setSubmitError(t("customerCredit.errCustomerName"));
    if (cleanProducts.length === 0) return setSubmitError(t("customerCredit.errProduct"));
    if (!isSaleDateAllowed(saleDate)) return setSubmitError(t("customerCredit.errSaleDate"));

    // Primary mobile is mandatory; alternate optional; they cannot match.
    const primaryRaw = customerMobile.trim();
    if (!MOBILE_RE.test(primaryRaw)) return setSubmitError(t("customerCredit.errMobileRequired"));
    const altRaw = customerAltContact.trim();
    if (altRaw && !MOBILE_RE.test(altRaw)) return setSubmitError(t("customerCredit.errMobile"));
    if (altRaw && altRaw === primaryRaw) return setSubmitError(t("customerCredit.errAltSame"));

    if (customerEmail.trim() && !EMAIL_RE.test(customerEmail.trim()))
      return setSubmitError(t("customerCredit.errEmail"));
    if (customerPin.trim() && !isValidIndianPincode(customerPin))
      return setSubmitError(t("customerCredit.errPin"));

    // Document credential validation.
    if (documentType === "pan" && documentReference.trim() && !isValidPan(documentReference))
      return setSubmitError(t("customerCredit.errPan"));

    if (usesSchedule) {
      const count = Math.floor(toNumber(emiCount));
      if (count < 1 || count > CREDIT_MAX_INSTALMENTS)
        return setSubmitError(t("customerCredit.errEmiCount"));
      if (!firstDueDate || !isFirstDueDateAllowed(firstDueDate, saleDate))
        return setSubmitError(t("customerCredit.errFirstDueFuture"));
      if (principalBalance <= 0) return setSubmitError(t("customerCredit.errBalance"));
    }
    if (usesFinance && mode === "external_finance" && !financerName.trim())
      return setSubmitError(t("customerCredit.errFinancer"));

    let primaryNorm: string;
    let altNorm: string | null = null;
    try {
      primaryNorm = normalizeIndianMobile(primaryRaw);
      if (altRaw) altNorm = normalizeIndianMobile(altRaw);
    } catch {
      return setSubmitError(t("customerCredit.errMobile"));
    }

    setSubmitError(null);
    saveLockRef.current = true;
    setSubmitting(true);
    let succeeded = false;
    try {
      logSaveDiagnostic({
        phase: "start",
        recordKind: "customer_credit",
        userId: user.uid,
        route: "/(app)/customer-credit/form",
        clientRecordId: clientRecordIdRef.current,
        idempotencyKey: idempotencyRef.current?.idempotencyKey,
        source: isEditing ? "edit" : "create",
        message: "form_save_start",
      });

      const repo = getCustomerCreditRepository();
      const now = Date.now();
      const common = {
        mode,
        customerName: customerName.trim(),
        customerMobile: primaryNorm,
        customerAltContact: altNorm,
        customerAddress: addressLine.trim() || null,
        customerLocality: locality.trim() || null,
        customerCity: city.trim() || null,
        customerState: customerState.trim() || null,
        customerPin: customerPin.trim() ? normalizeIndianPinInput(customerPin) : null,
        customerEmail: customerEmail.trim() || null,
        documentType: documentType || null,
        documentReference:
          documentReference.trim()
            ? documentType === "pan"
              ? normalizePan(documentReference)
              : documentReference.trim()
            : null,
        products: cleanProducts,
        saleAmount: saleTotal,
        downPayment: !paidInFull && downPayment.trim() ? toNumber(downPayment) : null,
        interestCharges: usesSchedule ? chargesBreakdown.financedCharges : null,
        charges: chargesConfig,
        upfrontCharges: chargesBreakdown.upfrontCharges || null,
        totalPayable,
        emiFrequency: usesSchedule ? emiFrequency : null,
        emiCount: usesSchedule ? Math.floor(toNumber(emiCount)) : null,
        emiAmount: schedule[0]?.amount ?? null,
        firstDueDate: usesSchedule ? firstDueDate : null,
        customIntervalDays:
          usesSchedule && emiFrequency === "custom" ? Math.floor(toNumber(customIntervalDays)) : null,
        schedule,
        financerName: usesFinance ? financerName.trim() || null : null,
        financeRefNumber: usesFinance ? financeRefNumber.trim() || null : null,
        financeDownPayment:
          usesFinance && financeDownPayment.trim() ? toNumber(financeDownPayment) : null,
        financeAmount: usesFinance && financeAmount.trim() ? toNumber(financeAmount) : null,
        shopFollowUpRequired: usesFinance ? shopFollowUpRequired : false,
        guarantorName: guarantorName.trim() || null,
        remarks: remarks.trim() || null,
        idAttachmentConsentAt: idConsent ? existing?.idAttachmentConsentAt ?? now : null,
      };

      let saved = await saveCustomerCreditWithPdf(user.uid, {
        user,
        locale,
        uiLang: lang,
        t,
        route: "/(app)/customer-credit/form",
        idempotency: isEditing ? undefined : idempotencyRef.current ?? undefined,
        update: isEditing && existing ? { id: existing.id, ...common } : undefined,
        create: !isEditing
          ? {
              ueid: user.ueid,
              saleDate,
              clientRecordId: clientRecordIdRef.current,
              ...common,
            }
          : undefined,
        paidInFullPayment:
          paidInFull && !isEditing
            ? {
                amount: saleTotal,
                paidDate: saleDate,
                mode: paidMode,
                reference: paidReference.trim() || null,
                note: null,
                clientPaymentId: paidInFullPaymentIdRef.current,
              }
            : undefined,
      });

      // Customer photo: persist a freshly-picked photo; remove if cleared.
      if (pickedPhoto) {
        try {
          const ref = await persistCustomerPhoto(user.uid, saved.id, pickedPhoto);
          saved = await repo.update(user.uid, { id: saved.id, customerPhoto: ref });
        } catch {
          // photo persistence is non-fatal
        }
      } else if (photoRemoved && existing?.customerPhoto) {
        await removeCustomerPhotoFile(existing.customerPhoto);
        saved = await repo.update(user.uid, { id: saved.id, customerPhoto: null });
      }

      const listed = await repo.list(user.uid);
      logSaveDiagnostic({
        phase: "complete",
        recordKind: "customer_credit",
        userId: user.uid,
        remoteId: saved.id,
        message: listed.some((r) => r.id === saved.id)
          ? "list_fetch_after_save_ok"
          : "list_fetch_after_save_missing",
      });

      succeeded = true;
      logSaveDiagnostic({
        phase: "complete",
        recordKind: "customer_credit",
        userId: user.uid,
        remoteId: saved.id,
        message: "navigation_after_save",
      });

      router.replace({
        pathname: "/(app)/customer-credit/[id]",
        params: { id: saved.id },
      });

      if (saved.pdfUri) {
        void pdfService
          .share({ uri: saved.pdfUri, fileName: saved.recordNumber })
          .catch(() => {
            // share dismissed or unavailable — record is already saved
          })
          .finally(() => {
            logSaveDiagnostic({
              phase: "complete",
              recordKind: "customer_credit",
              userId: user.uid,
              remoteId: saved.id,
              message: "pdf_closed",
            });
          });
      }
    } catch (e) {
      if (e instanceof SaveStillInProgressError) {
        setSubmitError(t("customerCredit.errSaveInProgress"));
        return;
      }
      setSubmitError(userFacingMessage(e) || t("customerCredit.errGenerate"));
    } finally {
      setSubmitting(false);
      saveLockRef.current = false;
      logSaveDiagnostic({
        phase: "complete",
        recordKind: "customer_credit",
        userId: user?.uid,
        message: succeeded ? "submit_state_reset_success" : "submit_state_reset",
      });
    }
  }, [
    user,
    submitting,
    customerName,
    customerMobile,
    customerAltContact,
    addressLine,
    locality,
    city,
    customerState,
    customerPin,
    customerEmail,
    documentType,
    documentReference,
    cleanProducts,
    saleTotal,
    saleDate,
    mode,
    paidInFull,
    paidMode,
    paidReference,
    downPayment,
    chargesConfig,
    chargesBreakdown,
    totalPayable,
    usesSchedule,
    usesFinance,
    emiFrequency,
    emiCount,
    customIntervalDays,
    firstDueDate,
    principalBalance,
    schedule,
    financerName,
    financeRefNumber,
    financeDownPayment,
    financeAmount,
    shopFollowUpRequired,
    guarantorName,
    remarks,
    idConsent,
    pickedPhoto,
    photoRemoved,
    existing,
    isEditing,
    locale,
    t,
    router,
  ]);

  const modeOptions: SelectOption[] = useMemo(
    () => [
      { value: "cash", label: t("customerCredit.modeCash") },
      { value: "credit", label: t("customerCredit.modeCredit") },
      { value: "shop_emi", label: t("customerCredit.modeShopEmi") },
      { value: "external_finance", label: t("customerCredit.modeExternal") },
      { value: "mixed", label: t("customerCredit.modeMixed") },
    ],
    [t]
  );
  const freqOptions: SelectOption[] = useMemo(
    () => [
      { value: "monthly", label: t("customerCredit.freqMonthly") },
      { value: "weekly", label: t("customerCredit.freqWeekly") },
      { value: "custom", label: t("customerCredit.freqCustom") },
    ],
    [t]
  );
  const chargesOptions: SelectOption[] = useMemo(
    () => [
      { value: "none", label: t("customerCredit.chargesNone") },
      { value: "fixed", label: t("customerCredit.chargesFixed") },
      { value: "interest_pct", label: t("customerCredit.chargesInterestPct") },
      { value: "processing_pct", label: t("customerCredit.chargesProcessingPct") },
      { value: "interest_plus_processing", label: t("customerCredit.chargesInterestPlusProcessing") },
      { value: "custom", label: t("customerCredit.chargesCustom") },
    ],
    [t]
  );
  const baseOptions: SelectOption[] = useMemo(
    () => [
      { value: "principal", label: t("customerCredit.basePrincipal") },
      { value: "sale", label: t("customerCredit.baseSale") },
    ],
    [t]
  );
  const docOptions: SelectOption[] = useMemo(
    () => [
      { value: "", label: t("customerCredit.docNone") },
      { value: "aadhaar", label: t("customerCredit.docAadhaar") },
      { value: "pan", label: t("customerCredit.docPan") },
      { value: "driving_licence", label: t("customerCredit.docDrivingLicence") },
      { value: "voter_id", label: t("customerCredit.docVoterId") },
      { value: "passport", label: t("customerCredit.docPassport") },
      { value: "other", label: t("customerCredit.docOther") },
    ],
    [t]
  );
  const paidModeOptions: SelectOption[] = useMemo(
    () => [
      { value: "cash", label: t("customerCredit.payCash") },
      { value: "upi", label: t("customerCredit.payUpi") },
      { value: "card", label: t("customerCredit.payCard") },
      { value: "bank_transfer", label: t("customerCredit.payBank") },
      { value: "finance_company", label: t("customerCredit.payFinanceCompany") },
      { value: "other", label: t("customerCredit.payOther") },
    ],
    [t]
  );

  const showInterestPct = chargesMode === "interest_pct" || chargesMode === "interest_plus_processing";
  const showProcessing = chargesMode === "processing_pct" || chargesMode === "interest_plus_processing";
  const showFixed = chargesMode === "fixed" || chargesMode === "custom";

  const ccNavOrder = useMemo(
    () =>
      buildCustomerCreditNavOrder({
        products,
        showFullAddress,
        paidInFull,
        showFixed,
        showInterestPct,
        showProcessing,
        usesSchedule,
        emiFrequency,
        usesFinance,
        hasDocumentType: Boolean(documentType),
      }),
    [
      products,
      showFullAddress,
      paidInFull,
      showFixed,
      showInterestPct,
      showProcessing,
      usesSchedule,
      emiFrequency,
      usesFinance,
      documentType,
    ]
  );
  useFormFieldNavigation(ccNavOrder);

  if (loading) {
    return (
      <Screen>
        <Header title={t("customerCredit.formTitle")} showBack onBackPress={goBack} />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }
  if (loadError) {
    return (
      <Screen>
        <Header title={t("customerCredit.formTitle")} showBack onBackPress={goBack} />
        <Banner tone="danger" message={loadError} />
      </Screen>
    );
  }

  return (
    <Screen scroll form>
      <Header
        variant="executive"
        title={isEditing ? t("customerCredit.editTitle") : t("customerCredit.formTitle")}
        showBack
        onBackPress={goBack}
      />
      <LocaleUiText style={styles.lead}>{t("customerCredit.formIntro")}</LocaleUiText>

      {isEditing && existing ? (
        <View style={styles.banner}>
          <Banner
            tone="info"
            message={t("customerCredit.editMetaBanner", {
              recordNumber: existing.recordNumber,
              version: existing.version + 1,
            })}
          />
        </View>
      ) : null}
      {submitError ? (
        <View style={styles.banner}>
          <Banner tone="danger" message={submitError} />
        </View>
      ) : null}

      {/* --- Sale type & date --- */}
      <FormSection title={t("customerCredit.sectionSale")}>
        <SelectField
          label={t("customerCredit.fieldMode")}
          value={mode}
          options={modeOptions}
          onChange={(v) => setMode(v as CustomerCreditMode)}
        />
        {!isEditing ? (
          <View>
            <LocaleUiText style={styles.fieldLabel}>{t("customerCredit.fieldSaleDate")}</LocaleUiText>
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateRow}>
              <Text style={styles.dateValue}>{formatShortDate(saleDate)}</Text>
              <LocaleUiText style={styles.dateChange}>{t("diary.reminder.pickDate")}</LocaleUiText>
            </Pressable>
            <LocaleUiText style={styles.infoNote}>{t("customerCredit.saleDateHint")}</LocaleUiText>
            {showDatePicker ? (
              <DateTimePicker
                mode="date"
                value={new Date(saleDate)}
                maximumDate={new Date()}
                onChange={(event, selected) => {
                  setShowDatePicker(false);
                  if (event.type === "dismissed" || !selected) return;
                  setSaleDate(selected.getTime());
                }}
              />
            ) : null}
          </View>
        ) : (
          <LocaleUiText style={styles.fieldLabel}>
            {t("customerCredit.fieldSaleDate")}: {formatShortDate(saleDate)}
          </LocaleUiText>
        )}
      </FormSection>

      {/* --- Customer --- */}
      <FormSection title={t("customerCredit.sectionCustomer")} style={styles.sectionGap}>
        <TextField
          navFieldKey="customerName"
          label={t("customerCredit.fieldCustomerName")}
          required
          value={customerName}
          onChangeText={setCustomerName}
          maxLength={120}
        />
        <View style={styles.row2}>
          <View style={styles.col}>
            <TextField
              navFieldKey="customerMobile"
              label={t("customerCredit.fieldMobile")}
              required
              value={customerMobile}
              onChangeText={(v) => setCustomerMobile(v.replace(/[^0-9]/g, "").slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
              error={
                customerMobile.trim() && !MOBILE_RE.test(customerMobile.trim())
                  ? t("customerCredit.errMobile")
                  : null
              }
            />
          </View>
          <View style={styles.col}>
            <TextField
              navFieldKey="customerAltContact"
              label={t("customerCredit.fieldAltContact")}
              value={customerAltContact}
              onChangeText={(v) => setCustomerAltContact(v.replace(/[^0-9]/g, "").slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
              error={
                customerAltContact.trim() && customerAltContact.trim() === customerMobile.trim()
                  ? t("customerCredit.errAltSame")
                  : customerAltContact.trim() && !MOBILE_RE.test(customerAltContact.trim())
                    ? t("customerCredit.errMobile")
                    : null
              }
            />
          </View>
        </View>
        {/* PIN-first, intelligent address */}
        <View style={styles.row2}>
          <View style={styles.col}>
            <TextField
              navFieldKey="customerPin"
              label={t("customerCredit.fieldPin")}
              value={customerPin}
              onChangeText={(v) => setCustomerPin(normalizeIndianPinInput(v))}
              keyboardType="number-pad"
              maxLength={6}
              error={
                customerPin.trim() && !isValidIndianPincode(customerPin)
                  ? t("customerCredit.errPin")
                  : null
              }
            />
          </View>
          <View style={styles.col}>
            <TextField
              navFieldKey="city"
              label={t("customerCredit.fieldCity")}
              value={city}
              onChangeText={setCity}
              maxLength={60}
            />
          </View>
        </View>
        {pinResolved ? <Text style={styles.resolved}>{pinResolved}</Text> : null}
        <TextField
          navFieldKey="customerState"
          label={t("customerCredit.fieldState")}
          value={customerState}
          onChangeText={setCustomerState}
          maxLength={40}
        />
        {showFullAddress ? (
          <>
            <TextField
              navFieldKey="addressLine"
              label={t("customerCredit.fieldAddress")}
              value={addressLine}
              onChangeText={setAddressLine}
              maxLength={160}
            />
            <TextField
              navFieldKey="locality"
              label={t("customerCredit.fieldLocality")}
              value={locality}
              onChangeText={setLocality}
              maxLength={80}
            />
          </>
        ) : (
          <Pressable onPress={() => setShowFullAddress(true)}>
            <LocaleUiText style={styles.linkText}>{t("customerCredit.addFullAddress")}</LocaleUiText>
          </Pressable>
        )}
        <TextField
          label={t("customerCredit.fieldEmail")}
          value={customerEmail}
          onChangeText={setCustomerEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          maxLength={120}
          error={
            customerEmail.trim() && !EMAIL_RE.test(customerEmail.trim())
              ? t("customerCredit.errEmail")
              : null
          }
        />
      </FormSection>

      {/* --- Customer photo (optional, consent-based) --- */}
      <FormSection title={t("customerCredit.sectionPhoto")} style={styles.sectionGap}>
        <View style={styles.photoRow}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoThumb} resizeMode="cover" />
          ) : (
            <View style={styles.photoThumb} />
          )}
          <View style={styles.photoActions}>
            <Button
              label={photoUri ? t("common.change") : t("customerCredit.photoAdd")}
              variant="secondary"
              fullWidth={false}
              onPress={promptPhoto}
            />
            {photoUri ? (
              <Button
                label={t("customerCredit.photoRemove")}
                variant="ghost"
                fullWidth={false}
                onPress={removePhoto}
              />
            ) : null}
          </View>
        </View>
        <LocaleUiText style={styles.consentNote}>{t("customerCredit.photoConsentNote")}</LocaleUiText>
      </FormSection>

      {/* --- Products --- */}
      <FormSection title={t("customerCredit.sectionProducts")} style={styles.sectionGap}>
        {products.map((p, idx) => (
          <View key={idx} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <LocaleUiText style={styles.itemTitle}>{t("customerCredit.productN", { n: idx + 1 })}</LocaleUiText>
              {products.length > 1 ? (
                <Pressable onPress={() => removeProduct(idx)} hitSlop={8}>
                  <LocaleUiText style={styles.itemRemove}>{t("common.remove")}</LocaleUiText>
                </Pressable>
              ) : null}
            </View>
            <TextField
              navFieldKey={`product-${idx}-name`}
              label={t("customerCredit.fieldProductName")}
              required
              value={p.productName}
              onChangeText={(v) => updateProduct(idx, { productName: v })}
              maxLength={120}
            />
            <View style={styles.row2}>
              <View style={styles.col}>
                <TextField
                  navFieldKey={`product-${idx}-brandModel`}
                  label={t("customerCredit.fieldBrandModel")}
                  value={p.brandModel}
                  onChangeText={(v) => updateProduct(idx, { brandModel: v })}
                  maxLength={80}
                />
              </View>
              <View style={styles.col}>
                <TextField
                  navFieldKey={`product-${idx}-serialImei`}
                  label={t("customerCredit.fieldSerialImei")}
                  value={p.serialImei}
                  onChangeText={(v) => updateProduct(idx, { serialImei: v })}
                  maxLength={40}
                  autoCapitalize="characters"
                />
              </View>
            </View>
            <View style={styles.row2}>
              <View style={styles.col}>
                <TextField
                  navFieldKey={`product-${idx}-saleAmount`}
                  label={t("customerCredit.fieldSaleAmount")}
                  required
                  value={p.saleAmount}
                  onChangeText={(v) => updateProduct(idx, { saleAmount: v })}
                  keyboardType="decimal-pad"
                  maxLength={14}
                />
              </View>
              <View style={styles.col}>
                <TextField
                  navFieldKey={`product-${idx}-invoiceNumber`}
                  label={t("customerCredit.fieldInvoiceNo")}
                  value={p.invoiceNumber}
                  onChangeText={(v) => updateProduct(idx, { invoiceNumber: v })}
                  maxLength={40}
                />
              </View>
            </View>
          </View>
        ))}
        {products.length < CREDIT_MAX_PRODUCTS ? (
          <Button label={t("customerCredit.addProduct")} variant="secondary" onPress={addProduct} />
        ) : null}
        <View style={styles.totalRow}>
          <LocaleUiText style={styles.totalLabel}>{t("customerCredit.saleTotal")}</LocaleUiText>
          <Text style={styles.totalValue}>{fmtMoney(saleTotal)}</Text>
        </View>
        <Text style={styles.wordsText}>
          {t("customerCredit.amountInWords")}:{" "}
          {formatINRInWords(saleTotal, locale === "hi-IN" ? "hi-IN" : "en-IN")}
        </Text>
      </FormSection>

      {/* --- Payment / EMI --- */}
      {paidInFull ? (
        <FormSection title={t("customerCredit.sectionPaidFull")} style={styles.sectionGap}>
          <SelectField
            label={t("customerCredit.fieldPaidMode")}
            value={paidMode}
            options={paidModeOptions}
            onChange={(v) => setPaidMode(v as CreditPaymentMode)}
          />
          <TextField
            navFieldKey="paidReference"
            label={t("customerCredit.fieldPaymentReference")}
            value={paidReference}
            onChangeText={setPaidReference}
            maxLength={60}
          />
          <LocaleUiText style={styles.infoNote}>{t("customerCredit.paidInFullNote")}</LocaleUiText>
        </FormSection>
      ) : (
        <FormSection title={t("customerCredit.sectionPayment")} style={styles.sectionGap}>
          <TextField
            navFieldKey="downPayment"
            label={t("customerCredit.fieldDownPayment")}
            value={downPayment}
            onChangeText={setDownPayment}
            keyboardType="decimal-pad"
            maxLength={14}
          />

          {/* Interest / charges model */}
          <SelectField
            label={t("customerCredit.fieldChargesMode")}
            value={chargesMode}
            options={chargesOptions}
            onChange={(v) => setChargesMode(v as CreditChargesMode)}
          />
          {showFixed ? (
            <View style={styles.row2}>
              <View style={styles.col}>
                <TextField
                  navFieldKey="chargesAmount"
                  label={t("customerCredit.fieldChargesAmount")}
                  value={chargesAmount}
                  onChangeText={setChargesAmount}
                  keyboardType="decimal-pad"
                  maxLength={12}
                />
              </View>
              <View style={styles.col}>
                <TextField
                  navFieldKey="chargesLabel"
                  label={t("customerCredit.fieldChargesLabel")}
                  value={chargesLabel}
                  onChangeText={setChargesLabel}
                  maxLength={40}
                />
              </View>
            </View>
          ) : null}
          {showInterestPct ? (
            <TextField
              navFieldKey="interestPercent"
              label={t("customerCredit.fieldInterestPercent")}
              value={interestPercent}
              onChangeText={setInterestPercent}
              keyboardType="decimal-pad"
              maxLength={6}
            />
          ) : null}
          {showProcessing ? (
            <>
              <View style={styles.row2}>
                <View style={styles.col}>
                  <TextField
                    navFieldKey="processingPercent"
                    label={t("customerCredit.fieldProcessingPercent")}
                    value={processingPercent}
                    onChangeText={setProcessingPercent}
                    keyboardType="decimal-pad"
                    maxLength={6}
                  />
                </View>
                <View style={styles.col}>
                  <TextField
                    navFieldKey="processingAmount"
                    label={t("customerCredit.fieldProcessingAmount")}
                    value={processingAmount}
                    onChangeText={setProcessingAmount}
                    keyboardType="decimal-pad"
                    maxLength={12}
                  />
                </View>
              </View>
              <View style={styles.switchRow}>
                <LocaleUiText style={styles.switchLabel}>{t("customerCredit.processingUpfront")}</LocaleUiText>
                <Switch value={processingUpfront} onValueChange={setProcessingUpfront} />
              </View>
            </>
          ) : null}
          {showInterestPct || showProcessing ? (
            <SelectField
              label={t("customerCredit.fieldChargesBase")}
              value={chargesBase}
              options={baseOptions}
              onChange={(v) => setChargesBase(v as "principal" | "sale")}
            />
          ) : null}
          {chargesMode !== "none" && chargesBreakdown.totalCharges > 0 ? (
            <LocaleUiText style={styles.infoNote}>
              {t("customerCredit.chargesSummary", {
                amount: fmtMoney(chargesBreakdown.totalCharges),
              })}
            </LocaleUiText>
          ) : null}

          {usesSchedule ? (
            <>
              <View style={styles.row2}>
                <View style={styles.col}>
                  <TextField
                    navFieldKey="emiCount"
                    label={t("customerCredit.fieldEmiCount")}
                    value={emiCount}
                    onChangeText={(v) => setEmiCount(v.replace(/[^0-9]/g, "").slice(0, 3))}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
                <View style={styles.col}>
                  <SelectField
                    label={t("customerCredit.fieldFrequency")}
                    value={emiFrequency}
                    options={freqOptions}
                    onChange={(v) => setEmiFrequency(v as EmiFrequency)}
                  />
                </View>
              </View>
              {emiFrequency === "custom" ? (
                <TextField
                  navFieldKey="customIntervalDays"
                  label={t("customerCredit.fieldCustomInterval")}
                  value={customIntervalDays}
                  onChangeText={(v) => setCustomIntervalDays(v.replace(/[^0-9]/g, "").slice(0, 3))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              ) : null}
              <View>
                <LocaleUiText style={styles.fieldLabel}>{t("customerCredit.fieldFirstDue")}</LocaleUiText>
                <Pressable onPress={() => setShowDuePicker(true)} style={styles.dateRow}>
                  <Text style={styles.dateValue}>
                    {firstDueDate && isFirstDueDateAllowed(firstDueDate, saleDate)
                      ? formatShortDate(firstDueDate)
                      : t("customerCredit.pickDuePrompt")}
                  </Text>
                  <LocaleUiText style={styles.dateChange}>{t("diary.reminder.pickDate")}</LocaleUiText>
                </Pressable>
                <LocaleUiText style={styles.infoNote}>{t("customerCredit.firstDueHint")}</LocaleUiText>
                {showDuePicker ? (
                  <DateTimePicker
                    mode="date"
                    value={firstDuePickerDate}
                    minimumDate={new Date(firstDueMinMs)}
                    maximumDate={new Date(firstDueMaxMs)}
                    onChange={(event, selected) => {
                      if (event.type === "dismissed" || !selected) {
                        setShowDuePicker(false);
                        return;
                      }
                      setShowDuePicker(false);
                      const normalized = normalizeCreditCalendarDay(selected.getTime());
                      const clamped = Math.min(
                        Math.max(normalized, firstDueMinMs),
                        firstDueMaxMs
                      );
                      setFirstDueDate(clamped);
                    }}
                  />
                ) : null}
              </View>
              {schedule.length > 0 ? (
                <View style={styles.schedulePreview}>
                  <View style={styles.scheduleRow}>
                    <LocaleUiText style={styles.scheduleText}>{t("customerCredit.totalPayable")}</LocaleUiText>
                    <Text style={styles.scheduleText}>{fmtMoney(totalPayable ?? 0)}</Text>
                  </View>
                  <View style={styles.scheduleRow}>
                    <LocaleUiText style={styles.scheduleText}>
                      {t("customerCredit.instalmentsLabel", { n: schedule.length })}
                    </LocaleUiText>
                    <Text style={styles.scheduleText}>{fmtMoney(schedule[0].amount)}</Text>
                  </View>
                  <View style={styles.scheduleRow}>
                    <LocaleUiText style={styles.scheduleText}>{t("customerCredit.firstDueLabel")}</LocaleUiText>
                    <Text style={styles.scheduleText}>{formatShortDate(schedule[0].dueDate)}</Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </FormSection>
      )}

      {/* --- External finance --- */}
      {usesFinance ? (
        <FormSection title={t("customerCredit.sectionFinance")} style={styles.sectionGap}>
          <TextField
            navFieldKey="financerName"
            label={t("customerCredit.fieldFinancer")}
            required={mode === "external_finance"}
            value={financerName}
            onChangeText={setFinancerName}
            maxLength={120}
          />
          <View style={styles.row2}>
            <View style={styles.col}>
              <TextField
                navFieldKey="financeRefNumber"
                label={t("customerCredit.fieldFinanceRef")}
                value={financeRefNumber}
                onChangeText={setFinanceRefNumber}
                maxLength={60}
              />
            </View>
            <View style={styles.col}>
              <TextField
                navFieldKey="financeAmount"
                label={t("customerCredit.fieldFinanceAmount")}
                value={financeAmount}
                onChangeText={setFinanceAmount}
                keyboardType="decimal-pad"
                maxLength={12}
              />
            </View>
          </View>
          <TextField
            navFieldKey="financeDownPayment"
            label={t("customerCredit.fieldFinanceDown")}
            value={financeDownPayment}
            onChangeText={setFinanceDownPayment}
            keyboardType="decimal-pad"
            maxLength={12}
          />
          <View style={styles.switchRow}>
            <LocaleUiText style={styles.switchLabel}>{t("customerCredit.financeProvided")}</LocaleUiText>
            <Switch value={financeProvided} onValueChange={setFinanceProvided} />
          </View>
          <View style={styles.switchRow}>
            <LocaleUiText style={styles.switchLabel}>{t("customerCredit.shopFollowUp")}</LocaleUiText>
            <Switch value={shopFollowUpRequired} onValueChange={setShopFollowUpRequired} />
          </View>
          <LocaleUiText style={styles.infoNote}>{t("customerCredit.financeBoundaryNote")}</LocaleUiText>
        </FormSection>
      ) : null}

      {/* --- Customer document (record-keeping only) --- */}
      <FormSection title={t("customerCredit.sectionDocument")} style={styles.sectionGap}>
        <SelectField
          label={t("customerCredit.fieldDocType")}
          value={documentType}
          options={docOptions}
          onChange={(v) => setDocumentType(v as CustomerDocumentType | "")}
        />
        {documentType ? (
          <>
            <TextField
              navFieldKey="documentReference"
              label={t("customerCredit.fieldDocReference")}
              value={documentReference}
              onChangeText={setDocumentReference}
              autoCapitalize={documentType === "pan" ? "characters" : "none"}
              maxLength={40}
              error={
                documentType === "pan" && documentReference.trim() && !isValidPan(documentReference)
                  ? t("customerCredit.errPan")
                  : null
              }
            />
            <Text style={styles.consentNote}>
              {documentType === "pan"
                ? t("customerCredit.panGuidance")
                : documentType === "aadhaar"
                  ? t("customerCredit.aadhaarGuidance")
                  : ""}
            </Text>
          </>
        ) : null}
        <View style={styles.switchRow}>
          <LocaleUiText style={styles.switchLabel}>{t("customerCredit.consentLabel")}</LocaleUiText>
          <Switch value={idConsent} onValueChange={setIdConsent} />
        </View>
        <LocaleUiText style={styles.consentNote}>{t("customerCredit.consentNote")}</LocaleUiText>
        <TextField
          label={t("customerCredit.fieldGuarantor")}
          value={guarantorName}
          onChangeText={setGuarantorName}
          maxLength={120}
        />
        <TextField
          navFieldKey="remarks"
          label={t("customerCredit.fieldRemarks")}
          value={remarks}
          onChangeText={setRemarks}
          multiline
          maxLength={400}
        />
      </FormSection>

      <View style={styles.actions}>
        <Button
          label={
            submitting
              ? t("customerCredit.generating")
              : isEditing
                ? t("customerCredit.updateShare")
                : t("customerCredit.createShare")
          }
          loading={submitting}
          onPress={onSubmit}
        />
      </View>
    </Screen>
  );
}
