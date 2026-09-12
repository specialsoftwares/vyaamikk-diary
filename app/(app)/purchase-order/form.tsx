/**
 * Purchase Order create / edit form.
 *
 *   • No `id` param  → create a new PO (serial allocated on save).
 *   • `id` param     → edit an existing PO (PO number + created date fixed;
 *                       only the modified date advances).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
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
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { userFacingMessage } from "@/domain/errors";
import { formatShortDate } from "@/utils/date";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { requestComposerPickerReturn } from "@/navigation";
import {
  computePurchaseOrderTax,
  DEFAULT_PO_TERMS,
  isPoDateAllowed,
  PO_DESCRIPTION_LINE_MAX,
  PO_GST_RATES,
  PO_MAX_DESCRIPTION_LINES,
  PO_UNIT_OPTIONS,
  type PoTaxApplicability,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from "@/domain/purchaseOrder";
import { getPurchaseOrderRepository } from "@/services/purchaseOrder";
import { savePurchaseOrderWithPdf } from "@/services/purchaseOrder/saveWithPdf";
import { pdfService } from "@/services/pdf/pdfService";
import {
  gstinStateCode,
  gstinStateName,
  isValidGstin,
  normalizeGstin,
} from "@/utils/gst/gstin";
import {
  isValidIndianPincode,
  normalizeIndianPinInput,
  resolveIndianPincode,
} from "@/services/location/pincodeResolver";
import {
  applyLatestPinAutofill,
  createStaleSafePincodeLookup,
  EMPTY_PIN_AUTOFILL,
  pinAutofillStateAfterUserEdit,
  pinAutofillStateFromLoaded,
  type PinAutofillFieldState,
} from "@/services/location/staleSafePincodeLookup";
import { formatINRInWords } from "@/utils/money/inrWords";
import { useFormFieldNavigation } from "@/components/inputSafety/FormFocusManager";
import { buildPurchaseOrderNavOrder } from "@/utils/formFieldNavigation/fieldNavOrders";
import { SaveStillInProgressError } from "@/services/records/saveLockTypes";
import {
  createSaveIdempotencyContext,
  generateClientRecordId,
  type SaveIdempotencyContext,
} from "@/services/records/saveIdempotency";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{7,15}$/;

interface ItemDraft {
  itemName: string;
  descriptionLines: string[];
  quantity: string;
  unit: string;
  unitOther: string;
  rate: string;
  taxRate: string;
}

function emptyItem(): ItemDraft {
  return {
    itemName: "",
    descriptionLines: [],
    quantity: "",
    unit: "",
    unitOther: "",
    rate: "",
    taxRate: "",
  };
}

function toNumber(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function itemAmount(it: ItemDraft): number {
  return toNumber(it.quantity) * toNumber(it.rate);
}

function resolveUnit(it: ItemDraft): string | null {
  if (it.unit === "Other") return it.unitOther.trim() || "Other";
  return it.unit.trim() || null;
}

export default function PurchaseOrderFormScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const { id: editId, fromPicker } = useLocalSearchParams<{
    id?: string;
    fromPicker?: string;
  }>();
  const isEditing = Boolean(editId);
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      lead: { ...typography.body, color: c.textMuted, marginBottom: spacing.md },
      banner: { marginBottom: spacing.md },
      sectionGap: { marginTop: spacing.md },
      fieldLabel: formFieldLabelStyle(c),
      infoNote: { ...typography.caption, color: c.textSubtle, marginTop: 2 },
      warnNote: { ...typography.caption, color: c.warning ?? "#B45309", marginTop: 2 },
      dateRow: formDateRowStyle(isDark, c),
      dateValue: { ...typography.body, color: c.text },
      dateChange: { ...typography.caption, color: c.primary },
      switchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
        paddingVertical: spacing.xs,
      },
      switchLabel: { ...typography.body, color: c.text, flex: 1 },
      switchHint: { ...typography.caption, color: c.textSubtle },
      itemCard: formNestedCardStyle(isDark, c),
      itemHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
      itemTitle: { ...typography.captionStrong, color: c.text },
      itemRemove: { ...typography.caption, color: c.danger },
      addLineLink: { ...typography.caption, color: c.primary, marginTop: spacing.xs },
      qtyRow: { flexDirection: "row", gap: spacing.sm },
      qtyCol: { flex: 1 },
      amountText: { ...typography.caption, color: c.textMuted, textAlign: "right" },
      totalRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: spacing.sm,
        paddingTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: c.divider,
      },
      totalLabel: { ...typography.titleSm, color: c.text },
      totalValue: { ...typography.titleSm, color: c.primary },
      wordsText: { ...typography.caption, color: c.textMuted, marginTop: spacing.xs },
      actions: { gap: spacing.md, marginTop: spacing.lg },
    })
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const saveLockRef = useRef(false);
  const clientRecordIdRef = useRef(
    editId ? String(editId) : generateClientRecordId("po")
  );
  const idempotencyRef = useRef<SaveIdempotencyContext | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [existing, setExisting] = useState<PurchaseOrder | null>(null);

  // Form state
  const [poDate, setPoDate] = useState<number>(Date.now());
  const [vendorName, setVendorName] = useState("");
  const [vendorGstin, setVendorGstin] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorPin, setVendorPin] = useState("");
  const [vendorState, setVendorState] = useState("");
  const [vendorContactName, setVendorContactName] = useState("");
  const [vendorContactPhone, setVendorContactPhone] = useState("");
  const [vendorContactEmail, setVendorContactEmail] = useState("");

  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [buyerPin, setBuyerPin] = useState("");
  const [buyerState, setBuyerState] = useState("");
  const [authorizedBy, setAuthorizedBy] = useState("");
  const [authorizedDesignation, setAuthorizedDesignation] = useState("");

  const [shipSameAsBuyer, setShipSameAsBuyer] = useState(true);
  const [shipName, setShipName] = useState("");
  const [shipAddress, setShipAddress] = useState("");
  const [shipPin, setShipPin] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipContact, setShipContact] = useState("");

  const [taxApplicable, setTaxApplicable] = useState<PoTaxApplicability>("none");
  const [gstRateSel, setGstRateSel] = useState<string>("18");
  const [gstRateCustom, setGstRateCustom] = useState("");

  const [useLogo, setUseLogo] = useState(false);

  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [freightTerms, setFreightTerms] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(DEFAULT_PO_TERMS);
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);

  const poNavOrder = useMemo(
    () =>
      buildPurchaseOrderNavOrder(items, {
        shipSameAsBuyer,
        taxApplicable,
        gstRateSel,
      }),
    [items, shipSameAsBuyer, taxApplicable, gstRateSel]
  );
  useFormFieldNavigation(poNavOrder);

  const hasLogo = Boolean(user?.profileLogo?.localUri);
  const vendorPinLookupRef = useRef(createStaleSafePincodeLookup(resolveIndianPincode));
  const buyerPinLookupRef = useRef(createStaleSafePincodeLookup(resolveIndianPincode));
  const shipPinLookupRef = useRef(createStaleSafePincodeLookup(resolveIndianPincode));
  const vendorStateFillRef = useRef<PinAutofillFieldState>({ ...EMPTY_PIN_AUTOFILL });
  const buyerStateFillRef = useRef<PinAutofillFieldState>({ ...EMPTY_PIN_AUTOFILL });
  const shipStateFillRef = useRef<PinAutofillFieldState>({ ...EMPTY_PIN_AUTOFILL });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      if (editId) {
        const po = await getPurchaseOrderRepository().getById(user.uid, String(editId));
        if (po) {
          setExisting(po);
          setPoDate(po.poDate);
          setVendorName(po.vendorName);
          setVendorGstin(po.vendorGstin ?? "");
          setVendorAddress(po.vendorAddress ?? "");
          setVendorPin(po.vendorPin ?? "");
          setVendorState(po.vendorState ?? "");
          vendorStateFillRef.current = pinAutofillStateFromLoaded(
            po.vendorState ?? "",
            po.vendorPin ?? ""
          );
          setVendorContactName(po.vendorContactName ?? "");
          setVendorContactPhone(po.vendorContactPhone ?? "");
          setVendorContactEmail(po.vendorContactEmail ?? "");
          setBuyerName(po.buyerName);
          setBuyerAddress(po.buyerAddress ?? "");
          setBuyerGstin(po.buyerGstin ?? "");
          setBuyerPin(po.buyerPin ?? "");
          setBuyerState(po.buyerState ?? "");
          buyerStateFillRef.current = pinAutofillStateFromLoaded(
            po.buyerState ?? "",
            po.buyerPin ?? ""
          );
          setAuthorizedBy(po.authorizedBy ?? "");
          setAuthorizedDesignation(po.authorizedDesignation ?? "");
          setShipSameAsBuyer(po.shipSameAsBuyer ?? true);
          setShipName(po.shipName ?? "");
          setShipAddress(po.shipAddress ?? "");
          setShipPin(po.shipPin ?? "");
          setShipState(po.shipState ?? "");
          shipStateFillRef.current = pinAutofillStateFromLoaded(
            po.shipState ?? "",
            po.shipPin ?? ""
          );
          setShipContact(po.shipContact ?? "");
          setTaxApplicable(po.taxApplicable ?? "none");
          if (po.gstRate != null) {
            const isStd = (PO_GST_RATES as readonly number[]).includes(po.gstRate);
            setGstRateSel(isStd ? String(po.gstRate) : "custom");
            if (!isStd) setGstRateCustom(String(po.gstRate));
          }
          setUseLogo(po.useLogo ?? false);
          setReferenceNumber(po.referenceNumber ?? "");
          setPaymentTerms(po.paymentTerms ?? "");
          setDeliveryTerms(po.deliveryTerms ?? "");
          setFreightTerms(po.freightTerms ?? "");
          setDeliveryLocation(po.deliveryLocation ?? "");
          setNotes(po.notes ?? "");
          setTerms(po.terms ?? DEFAULT_PO_TERMS);
          setItems(
            po.items.length
              ? po.items.map((it) => {
                  const unitVal = it.unit ?? "";
                  const known = (PO_UNIT_OPTIONS as readonly string[]).includes(unitVal);
                  return {
                    itemName: it.itemName ?? it.description ?? "",
                    descriptionLines: it.descriptionLines ?? [],
                    quantity: String(it.quantity ?? ""),
                    unit: unitVal ? (known ? unitVal : "Other") : "",
                    unitOther: unitVal && !known ? unitVal : "",
                    rate: String(it.rate ?? ""),
                    taxRate: it.taxRate != null ? String(it.taxRate) : "",
                  };
                })
              : [emptyItem()]
          );
          return;
        }
      }
      // Create defaults — prefill buyer identity from profile.
      setBuyerName(user.businessName || user.displayName || "");
      setAuthorizedBy(user.displayName || "");
      setAuthorizedDesignation(user.designation || "");
      setUseLogo(hasLogo && user.pdfBranding?.includeProfileLogo !== false);
    } catch (e) {
      setLoadError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, editId, hasLogo]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!user || isEditing) return;
    idempotencyRef.current = createSaveIdempotencyContext({
      userId: user.uid,
      recordKind: "purchase_order",
      clientRecordId: clientRecordIdRef.current,
    });
  }, [user, isEditing]);

  // Best-effort: resolve vendor/buyer state from PIN. Latest PIN wins for
  // empty/auto-filled values; a manual edit for the current PIN is kept.
  useEffect(() => {
    const pin = normalizeIndianPinInput(vendorPin);
    if (!isValidIndianPincode(pin)) return;
    let cancelled = false;
    void vendorPinLookupRef.current.lookup(pin).then((r) => {
      if (cancelled || !r?.success || !r.state) return;
      setVendorState((prev) => {
        const next = applyLatestPinAutofill({
          current: prev,
          resolved: r.state,
          pin,
          field: vendorStateFillRef.current,
        });
        vendorStateFillRef.current = next.field;
        return next.value;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [vendorPin]);

  useEffect(() => {
    const pin = normalizeIndianPinInput(buyerPin);
    if (!isValidIndianPincode(pin)) return;
    let cancelled = false;
    void buyerPinLookupRef.current.lookup(pin).then((r) => {
      if (cancelled || !r?.success || !r.state) return;
      setBuyerState((prev) => {
        const next = applyLatestPinAutofill({
          current: prev,
          resolved: r.state,
          pin,
          field: buyerStateFillRef.current,
        });
        buyerStateFillRef.current = next.field;
        return next.value;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [buyerPin]);

  useEffect(() => {
    if (shipSameAsBuyer) return;
    const pin = normalizeIndianPinInput(shipPin);
    if (!isValidIndianPincode(pin)) return;
    let cancelled = false;
    void shipPinLookupRef.current.lookup(pin).then((r) => {
      if (cancelled || !r?.success || !r.state) return;
      setShipState((prev) => {
        const next = applyLatestPinAutofill({
          current: prev,
          resolved: r.state,
          pin,
          field: shipStateFillRef.current,
        });
        shipStateFillRef.current = next.field;
        return next.value;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [shipPin, shipSameAsBuyer]);

  const effectiveGstRate = useMemo(() => {
    if (taxApplicable !== "applicable") return null;
    return gstRateSel === "custom" ? toNumber(gstRateCustom) : Number(gstRateSel);
  }, [taxApplicable, gstRateSel, gstRateCustom]);

  const cleanItems: PurchaseOrderItem[] = useMemo(
    () =>
      items
        .filter((it) => it.itemName.trim() && (toNumber(it.quantity) > 0 || toNumber(it.rate) > 0))
        .map((it) => ({
          itemName: it.itemName.trim(),
          descriptionLines: it.descriptionLines
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, PO_MAX_DESCRIPTION_LINES),
          quantity: toNumber(it.quantity),
          unit: resolveUnit(it),
          rate: toNumber(it.rate),
          taxRate: it.taxRate.trim() ? toNumber(it.taxRate) : null,
          amount: itemAmount(it),
        })),
    [items]
  );

  const taxSummary = useMemo(
    () =>
      computePurchaseOrderTax({
        items: cleanItems,
        taxApplicable,
        gstRate: effectiveGstRate,
        vendorGstin,
        buyerGstin,
      }),
    [cleanItems, taxApplicable, effectiveGstRate, vendorGstin, buyerGstin]
  );

  const totalDisplay = useMemo(
    () => formatAmount(taxSummary.grandTotal),
    [taxSummary.grandTotal]
  );

  const amountWords = useMemo(
    () => formatINRInWords(taxSummary.grandTotal, locale === "hi-IN" ? "hi-IN" : "en-IN"),
    [taxSummary.grandTotal, locale]
  );

  const updateItem = useCallback((idx: number, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const updateDescLine = useCallback((idx: number, lineIdx: number, value: string) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const lines = [...it.descriptionLines];
        lines[lineIdx] = value;
        return { ...it, descriptionLines: lines };
      })
    );
  }, []);

  const addDescLine = useCallback((idx: number) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx && it.descriptionLines.length < PO_MAX_DESCRIPTION_LINES
          ? { ...it, descriptionLines: [...it.descriptionLines, ""] }
          : it
      )
    );
  }, []);

  const addItem = useCallback(() => setItems((prev) => [...prev, emptyItem()]), []);
  const removeItem = useCallback(
    (idx: number) => setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))),
    []
  );

  const goBack = useCallback(() => {
    if (fromPicker === "1") requestComposerPickerReturn("picker");
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/saved-records");
  }, [fromPicker, router]);

  const onSubmit = useCallback(async () => {
    if (!user) return;
    if (submitting || saveLockRef.current) return;

    if (!vendorName.trim()) return setSubmitError(t("purchaseOrder.errVendor"));
    if (!buyerName.trim()) return setSubmitError(t("purchaseOrder.errBuyer"));
    if (cleanItems.length === 0) return setSubmitError(t("purchaseOrder.errItems"));
    if (!isPoDateAllowed(poDate)) return setSubmitError(t("purchaseOrder.errDate"));

    if (!isValidGstin(vendorGstin)) return setSubmitError(t("purchaseOrder.errVendorGstin"));
    if (!isValidGstin(buyerGstin)) return setSubmitError(t("purchaseOrder.errBuyerGstin"));
    if (!isValidIndianPincode(vendorPin)) return setSubmitError(t("purchaseOrder.errVendorPin"));
    if (!isValidIndianPincode(buyerPin)) return setSubmitError(t("purchaseOrder.errBuyerPin"));
    if (!shipSameAsBuyer && shipPin.trim() && !isValidIndianPincode(shipPin))
      return setSubmitError(t("postal.invalidPin"));
    if (vendorContactPhone.trim() && !PHONE_RE.test(vendorContactPhone.trim()))
      return setSubmitError(t("purchaseOrder.errContactPhone"));
    if (vendorContactEmail.trim() && !EMAIL_RE.test(vendorContactEmail.trim()))
      return setSubmitError(t("purchaseOrder.errContactEmail"));
    if (taxApplicable === "applicable" && (effectiveGstRate == null || effectiveGstRate < 0))
      return setSubmitError(t("purchaseOrder.errGstRate"));

    setSubmitError(null);
    saveLockRef.current = true;
    setSubmitting(true);
    let succeeded = false;
    try {
      const totalValue = taxSummary.grandTotal;
      const common = {
        vendorName,
        vendorGstin: normalizeGstin(vendorGstin),
        vendorAddress: vendorAddress.trim() || null,
        vendorPin: normalizeIndianPinInput(vendorPin),
        vendorState: vendorState.trim() || null,
        vendorContactName: vendorContactName.trim() || null,
        vendorContactPhone: vendorContactPhone.trim() || null,
        vendorContactEmail: vendorContactEmail.trim() || null,
        buyerName,
        buyerAddress: buyerAddress.trim() || null,
        buyerGstin: normalizeGstin(buyerGstin),
        buyerPin: normalizeIndianPinInput(buyerPin),
        buyerState: buyerState.trim() || null,
        authorizedBy: authorizedBy.trim() || null,
        authorizedDesignation: authorizedDesignation.trim() || null,
        shipSameAsBuyer,
        shipName: shipSameAsBuyer ? null : shipName.trim() || null,
        shipAddress: shipSameAsBuyer ? null : shipAddress.trim() || null,
        shipPin: shipSameAsBuyer ? null : normalizeIndianPinInput(shipPin) || null,
        shipState: shipSameAsBuyer ? null : shipState.trim() || null,
        shipContact: shipSameAsBuyer ? null : shipContact.trim() || null,
        deliveryLocation: deliveryLocation.trim() || null,
        taxApplicable,
        gstRate: effectiveGstRate,
        useLogo: useLogo && hasLogo,
        referenceNumber: referenceNumber.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        deliveryTerms: deliveryTerms.trim() || null,
        freightTerms: freightTerms.trim() || null,
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        items: cleanItems,
        total: totalValue,
      };

      const saved = await savePurchaseOrderWithPdf(user.uid, {
        user,
        locale,
        t,
        idempotency: isEditing ? undefined : idempotencyRef.current ?? undefined,
        route: "/(app)/purchase-order/form",
        update: isEditing && existing ? { id: existing.id, ...common } : undefined,
        create: !isEditing
          ? {
              ueid: user.ueid,
              poDate,
              clientRecordId: clientRecordIdRef.current,
              ...common,
            }
          : undefined,
      });

      if (saved.pdfUri) {
        void pdfService
          .share({ uri: saved.pdfUri, fileName: saved.poNumber })
          .catch(() => undefined);
      }
      succeeded = true;
      router.replace(
        isEditing
          ? { pathname: "/(app)/purchase-order/form", params: { id: saved.id } }
          : { pathname: "/(app)/purchase-order/form", params: { id: saved.id } }
      );
    } catch (e) {
      if (e instanceof SaveStillInProgressError) {
        setSubmitError(t("purchaseOrder.errSaveInProgress"));
        return;
      }
      setSubmitError(userFacingMessage(e) || t("purchaseOrder.errGenerate"));
    } finally {
      setSubmitting(false);
      saveLockRef.current = false;
    }
  }, [
    user,
    submitting,
    vendorName,
    vendorGstin,
    vendorAddress,
    vendorPin,
    vendorState,
    vendorContactName,
    vendorContactPhone,
    vendorContactEmail,
    buyerName,
    buyerAddress,
    buyerGstin,
    buyerPin,
    buyerState,
    authorizedBy,
    authorizedDesignation,
    shipSameAsBuyer,
    shipName,
    shipAddress,
    shipPin,
    shipState,
    shipContact,
    deliveryLocation,
    taxApplicable,
    effectiveGstRate,
    useLogo,
    hasLogo,
    referenceNumber,
    paymentTerms,
    deliveryTerms,
    freightTerms,
    notes,
    terms,
    cleanItems,
    taxSummary.grandTotal,
    poDate,
    isEditing,
    existing,
    locale,
    t,
    router,
  ]);

  const unitOptions: SelectOption[] = useMemo(
    () => PO_UNIT_OPTIONS.map((u) => ({ value: u, label: u })),
    []
  );
  const gstRateOptions: SelectOption[] = useMemo(
    () => [
      ...PO_GST_RATES.map((r) => ({ value: String(r), label: `${r}%` })),
      { value: "custom", label: t("purchaseOrder.gstCustom") },
    ],
    [t]
  );
  const taxOptions: SelectOption[] = useMemo(
    () => [
      { value: "none", label: t("purchaseOrder.taxNone") },
      { value: "applicable", label: t("purchaseOrder.taxApplicable") },
      { value: "as_applicable", label: t("purchaseOrder.taxAsApplicable") },
    ],
    [t]
  );

  const gstinStateLabel = (gstin: string): string | null => {
    const name = gstinStateName(gstin);
    const code = gstinStateCode(gstin);
    if (!name && !code) return null;
    return code ? `${name ?? ""} (${code})`.trim() : name;
  };
  const vendorGstinState = vendorGstin.trim() ? gstinStateLabel(vendorGstin) : null;
  const buyerGstinState = buyerGstin.trim() ? gstinStateLabel(buyerGstin) : null;
  const vendorGstinStateName = vendorGstin.trim() ? gstinStateName(vendorGstin) : null;
  const buyerGstinStateName = buyerGstin.trim() ? gstinStateName(buyerGstin) : null;
  const statesDiffer = (a: string | null, b: string) =>
    !!a && !!b.trim() && a.toLowerCase() !== b.trim().toLowerCase();
  const vendorStateMismatch = statesDiffer(vendorGstinStateName, vendorState);
  const buyerStateMismatch = statesDiffer(buyerGstinStateName, buyerState);

  if (loading) {
    return (
      <Screen>
        <Header title={t("purchaseOrder.formTitle")} showBack onBackPress={goBack} />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <Header title={t("purchaseOrder.formTitle")} showBack onBackPress={goBack} />
        <Banner tone="danger" message={loadError} />
      </Screen>
    );
  }

  return (
    <Screen scroll form>
      <Header
        variant="executive"
        title={isEditing ? t("purchaseOrder.editTitle") : t("purchaseOrder.formTitle")}
        showBack
        onBackPress={goBack}
      />
      <LocaleUiText style={styles.lead}>{t("purchaseOrder.formIntro")}</LocaleUiText>

      {isEditing && existing ? (
        <View style={styles.banner}>
          <Banner
            tone="info"
            message={t("purchaseOrder.editMetaBanner", {
              poNumber: existing.poNumber,
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

      {/* --- PO details --- */}
      <FormSection title={t("purchaseOrder.sectionDetails")}>
        {!isEditing ? (
          <View>
            <LocaleUiText style={styles.fieldLabel}>{t("purchaseOrder.fieldDate")}</LocaleUiText>
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateRow}>
              <Text style={styles.dateValue}>{formatShortDate(poDate)}</Text>
              <LocaleUiText style={styles.dateChange}>{t("diary.reminder.pickDate")}</LocaleUiText>
            </Pressable>
            <LocaleUiText style={styles.infoNote}>{t("purchaseOrder.dateHint")}</LocaleUiText>
            {showDatePicker ? (
              <DateTimePicker
                mode="date"
                value={new Date(poDate)}
                maximumDate={new Date()}
                onChange={(event, selected) => {
                  setShowDatePicker(false);
                  if (event.type === "dismissed" || !selected) return;
                  setPoDate(selected.getTime());
                }}
              />
            ) : null}
          </View>
        ) : (
          <LocaleUiText style={styles.fieldLabel}>
            {t("purchaseOrder.fieldDate")}: {formatShortDate(poDate)}
          </LocaleUiText>
        )}
        <TextField
          navFieldKey="referenceNumber"
          label={t("purchaseOrder.fieldReference")}
          value={referenceNumber}
          onChangeText={setReferenceNumber}
          placeholder={t("purchaseOrder.fieldReferencePlaceholder")}
          maxLength={60}
        />
      </FormSection>

      {/* --- Buyer / Order To --- */}
      <FormSection title={t("purchaseOrder.sectionBuyer")} style={styles.sectionGap}>
        <TextField
          navFieldKey="buyerName"
          label={t("purchaseOrder.fieldBuyerName")}
          required
          value={buyerName}
          onChangeText={setBuyerName}
          maxLength={120}
        />
        <TextField
          navFieldKey="buyerGstin"
          label={t("purchaseOrder.fieldBuyerGstin")}
          required
          value={buyerGstin}
          onChangeText={(v) => setBuyerGstin(normalizeGstin(v))}
          autoCapitalize="characters"
          maxLength={15}
          error={
            buyerGstin.trim() && !isValidGstin(buyerGstin)
              ? t("purchaseOrder.errBuyerGstin")
              : null
          }
        />
        {buyerGstinState ? (
          <LocaleUiText style={styles.infoNote}>
            {t("purchaseOrder.stateFromGstin", { state: buyerGstinState })}
          </LocaleUiText>
        ) : null}
        <View style={styles.qtyRow}>
          <View style={styles.qtyCol}>
            <TextField
              navFieldKey="buyerPin"
              label={t("purchaseOrder.fieldPin")}
              required
              value={buyerPin}
              onChangeText={(v) => setBuyerPin(normalizeIndianPinInput(v))}
              keyboardType="number-pad"
              maxLength={6}
              error={
                buyerPin.trim() && !isValidIndianPincode(buyerPin)
                  ? t("purchaseOrder.errBuyerPin")
                  : null
              }
            />
          </View>
          <View style={styles.qtyCol}>
            <TextField
              navFieldKey="buyerState"
              label={t("purchaseOrder.fieldState")}
              value={buyerState}
              onChangeText={(v) => {
                buyerStateFillRef.current = pinAutofillStateAfterUserEdit(v, buyerPin);
                setBuyerState(v);
              }}
              maxLength={40}
            />
          </View>
        </View>
        {buyerStateMismatch ? (
          <LocaleUiText style={styles.warnNote}>
            {t("purchaseOrder.stateMismatch", { state: buyerGstinStateName ?? "" })}
          </LocaleUiText>
        ) : null}
        <TextField
          navFieldKey="buyerAddress"
          label={t("purchaseOrder.fieldBuyerAddress")}
          value={buyerAddress}
          onChangeText={setBuyerAddress}
          multiline
          maxLength={300}
        />
        <TextField
          navFieldKey="authorizedBy"
          label={t("purchaseOrder.fieldAuthorizedBy")}
          value={authorizedBy}
          onChangeText={setAuthorizedBy}
          maxLength={80}
        />
        <TextField
          navFieldKey="authorizedDesignation"
          label={t("purchaseOrder.fieldAuthorizedDesignation")}
          value={authorizedDesignation}
          onChangeText={setAuthorizedDesignation}
          maxLength={80}
        />
      </FormSection>

      {/* --- Vendor / Supplier --- */}
      <FormSection title={t("purchaseOrder.sectionVendor")} style={styles.sectionGap}>
        <TextField
          navFieldKey="vendorName"
          label={t("purchaseOrder.fieldVendorName")}
          required
          value={vendorName}
          onChangeText={setVendorName}
          placeholder={t("purchaseOrder.fieldVendorNamePlaceholder")}
          maxLength={120}
        />
        <TextField
          navFieldKey="vendorGstin"
          label={t("purchaseOrder.fieldVendorGstin")}
          required
          value={vendorGstin}
          onChangeText={(v) => setVendorGstin(normalizeGstin(v))}
          autoCapitalize="characters"
          maxLength={15}
          error={
            vendorGstin.trim() && !isValidGstin(vendorGstin)
              ? t("purchaseOrder.errVendorGstin")
              : null
          }
        />
        {vendorGstinState ? (
          <LocaleUiText style={styles.infoNote}>
            {t("purchaseOrder.stateFromGstin", { state: vendorGstinState })}
          </LocaleUiText>
        ) : null}
        <View style={styles.qtyRow}>
          <View style={styles.qtyCol}>
            <TextField
              navFieldKey="vendorPin"
              label={t("purchaseOrder.fieldPin")}
              required
              value={vendorPin}
              onChangeText={(v) => setVendorPin(normalizeIndianPinInput(v))}
              keyboardType="number-pad"
              maxLength={6}
              error={
                vendorPin.trim() && !isValidIndianPincode(vendorPin)
                  ? t("purchaseOrder.errVendorPin")
                  : null
              }
            />
          </View>
          <View style={styles.qtyCol}>
            <TextField
              navFieldKey="vendorState"
              label={t("purchaseOrder.fieldState")}
              value={vendorState}
              onChangeText={(v) => {
                vendorStateFillRef.current = pinAutofillStateAfterUserEdit(v, vendorPin);
                setVendorState(v);
              }}
              maxLength={40}
            />
          </View>
        </View>
        {vendorStateMismatch ? (
          <LocaleUiText style={styles.warnNote}>
            {t("purchaseOrder.stateMismatch", { state: vendorGstinStateName ?? "" })}
          </LocaleUiText>
        ) : null}
        <TextField
          navFieldKey="vendorAddress"
          label={t("purchaseOrder.fieldVendorAddress")}
          value={vendorAddress}
          onChangeText={setVendorAddress}
          multiline
          maxLength={300}
        />
        <TextField
          navFieldKey="vendorContactName"
          label={t("purchaseOrder.fieldContactName")}
          value={vendorContactName}
          onChangeText={setVendorContactName}
          maxLength={80}
        />
        <View style={styles.qtyRow}>
          <View style={styles.qtyCol}>
            <TextField
              navFieldKey="vendorContactPhone"
              label={t("purchaseOrder.fieldContactPhone")}
              value={vendorContactPhone}
              onChangeText={setVendorContactPhone}
              keyboardType="phone-pad"
              maxLength={20}
              error={
                vendorContactPhone.trim() && !PHONE_RE.test(vendorContactPhone.trim())
                  ? t("purchaseOrder.errContactPhone")
                  : null
              }
            />
          </View>
          <View style={styles.qtyCol}>
            <TextField
              navFieldKey="vendorContactEmail"
              label={t("purchaseOrder.fieldContactEmail")}
              value={vendorContactEmail}
              onChangeText={setVendorContactEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={120}
              error={
                vendorContactEmail.trim() && !EMAIL_RE.test(vendorContactEmail.trim())
                  ? t("purchaseOrder.errContactEmail")
                  : null
              }
            />
          </View>
        </View>
      </FormSection>

      {/* --- Shipping --- */}
      <FormSection title={t("purchaseOrder.sectionShipping")} style={styles.sectionGap}>
        <View style={styles.switchRow}>
          <LocaleUiText style={styles.switchLabel}>{t("purchaseOrder.shipSameAsBuyer")}</LocaleUiText>
          <Switch value={shipSameAsBuyer} onValueChange={setShipSameAsBuyer} />
        </View>
        {!shipSameAsBuyer ? (
          <>
            <TextField
              navFieldKey="shipName"
              label={t("purchaseOrder.fieldShipName")}
              value={shipName}
              onChangeText={setShipName}
              maxLength={120}
            />
            <TextField
              navFieldKey="shipAddress"
              label={t("purchaseOrder.fieldShipAddress")}
              value={shipAddress}
              onChangeText={setShipAddress}
              multiline
              maxLength={300}
            />
            <View style={styles.qtyRow}>
              <View style={styles.qtyCol}>
                <TextField
                  navFieldKey="shipPin"
                  label={t("purchaseOrder.fieldPin")}
                  value={shipPin}
                  onChangeText={(v) => setShipPin(normalizeIndianPinInput(v))}
                  keyboardType="number-pad"
                  maxLength={6}
                  error={
                    shipPin.trim() && !isValidIndianPincode(shipPin)
                      ? t("postal.invalidPin")
                      : null
                  }
                />
              </View>
              <View style={styles.qtyCol}>
                <TextField
                  navFieldKey="shipState"
                  label={t("purchaseOrder.fieldState")}
                  value={shipState}
                  onChangeText={(v) => {
                    shipStateFillRef.current = pinAutofillStateAfterUserEdit(v, shipPin);
                    setShipState(v);
                  }}
                  maxLength={40}
                />
              </View>
            </View>
            <TextField
              navFieldKey="shipContact"
              label={t("purchaseOrder.fieldShipContact")}
              value={shipContact}
              onChangeText={setShipContact}
              maxLength={80}
            />
          </>
        ) : null}
      </FormSection>

      {/* --- Tax --- */}
      <FormSection title={t("purchaseOrder.sectionTax")} style={styles.sectionGap}>
        <SelectField
          label={t("purchaseOrder.fieldTaxApplicable")}
          value={taxApplicable}
          options={taxOptions}
          onChange={(v) => setTaxApplicable(v as PoTaxApplicability)}
        />
        {taxApplicable === "applicable" ? (
          <>
            <SelectField
              label={t("purchaseOrder.fieldGstRate")}
              value={gstRateSel}
              options={gstRateOptions}
              onChange={setGstRateSel}
            />
            {gstRateSel === "custom" ? (
              <TextField
                navFieldKey="gstRateCustom"
                label={t("purchaseOrder.fieldGstCustom")}
                value={gstRateCustom}
                onChangeText={setGstRateCustom}
                keyboardType="decimal-pad"
                maxLength={6}
              />
            ) : null}
            <LocaleUiText style={styles.infoNote}>{t("purchaseOrder.taxSplitHint")}</LocaleUiText>
          </>
        ) : null}
      </FormSection>

      {/* --- Items --- */}
      <FormSection title={t("purchaseOrder.sectionItems")} style={styles.sectionGap}>
        {items.map((it, idx) => (
          <View key={idx} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <LocaleUiText style={styles.itemTitle}>{t("purchaseOrder.itemN", { n: idx + 1 })}</LocaleUiText>
              {items.length > 1 ? (
                <Pressable onPress={() => removeItem(idx)} hitSlop={8}>
                  <LocaleUiText style={styles.itemRemove}>{t("common.remove")}</LocaleUiText>
                </Pressable>
              ) : null}
            </View>
            <TextField
              navFieldKey={`item-${idx}-name`}
              label={t("purchaseOrder.fieldItemName")}
              required
              value={it.itemName}
              onChangeText={(v) => updateItem(idx, { itemName: v })}
              maxLength={120}
            />
            {it.descriptionLines.map((line, lineIdx) => (
              <TextField
                navFieldKey={`item-${idx}-desc-${lineIdx}`}
                key={lineIdx}
                label={t("purchaseOrder.fieldItemDescLine", { n: lineIdx + 1 })}
                value={line}
                onChangeText={(v) => updateDescLine(idx, lineIdx, v)}
                maxLength={PO_DESCRIPTION_LINE_MAX}
              />
            ))}
            {it.descriptionLines.length < PO_MAX_DESCRIPTION_LINES ? (
              <Pressable onPress={() => addDescLine(idx)} hitSlop={6}>
                <LocaleUiText style={styles.addLineLink}>{t("purchaseOrder.addDescLine")}</LocaleUiText>
              </Pressable>
            ) : null}
            <View style={styles.qtyRow}>
              <View style={styles.qtyCol}>
                <TextField
                  navFieldKey={`item-${idx}-qty`}
                  label={t("purchaseOrder.fieldQty")}
                  value={it.quantity}
                  onChangeText={(v) => updateItem(idx, { quantity: v })}
                  keyboardType="decimal-pad"
                  maxLength={12}
                />
              </View>
              <View style={styles.qtyCol}>
                <SelectField
                  label={t("purchaseOrder.fieldUnit")}
                  value={it.unit || null}
                  options={unitOptions}
                  placeholder={t("purchaseOrder.unitPlaceholder")}
                  onChange={(v) => updateItem(idx, { unit: v })}
                />
              </View>
            </View>
            {it.unit === "Other" ? (
              <TextField
                navFieldKey={`item-${idx}-unitOther`}
                label={t("purchaseOrder.fieldUnitOther")}
                value={it.unitOther}
                onChangeText={(v) => updateItem(idx, { unitOther: v })}
                maxLength={16}
              />
            ) : null}
            <View style={styles.qtyRow}>
              <View style={styles.qtyCol}>
                <TextField
                  navFieldKey={`item-${idx}-rate`}
                  label={t("purchaseOrder.fieldRate")}
                  value={it.rate}
                  onChangeText={(v) => updateItem(idx, { rate: v })}
                  keyboardType="decimal-pad"
                  maxLength={14}
                />
              </View>
              {taxApplicable === "applicable" ? (
                <View style={styles.qtyCol}>
                  <TextField
                    navFieldKey={`item-${idx}-tax`}
                    label={t("purchaseOrder.fieldItemTax")}
                    value={it.taxRate}
                    onChangeText={(v) => updateItem(idx, { taxRate: v })}
                    keyboardType="decimal-pad"
                    maxLength={6}
                  />
                </View>
              ) : null}
            </View>
            <LocaleUiText style={styles.amountText}>
              {t("purchaseOrder.fieldAmount")}: {itemAmount(it).toFixed(2)}
            </LocaleUiText>
          </View>
        ))}
        <Button label={t("purchaseOrder.addItem")} variant="secondary" onPress={addItem} />
        <View style={styles.totalRow}>
          <LocaleUiText style={styles.totalLabel}>{t("purchaseOrder.total")}</LocaleUiText>
          <Text style={styles.totalValue}>{totalDisplay}</Text>
        </View>
        <LocaleUiText style={styles.wordsText}>
          {t("purchaseOrder.amountInWords")}: {amountWords}
        </LocaleUiText>
      </FormSection>

      {/* --- Terms & notes --- */}
      <FormSection title={t("purchaseOrder.sectionTerms")} style={styles.sectionGap}>
        <TextField
          navFieldKey="paymentTerms"
          label={t("purchaseOrder.fieldPaymentTerms")}
          value={paymentTerms}
          onChangeText={setPaymentTerms}
          maxLength={120}
        />
        <TextField
          navFieldKey="deliveryTerms"
          label={t("purchaseOrder.fieldDeliveryTerms")}
          value={deliveryTerms}
          onChangeText={setDeliveryTerms}
          maxLength={120}
        />
        <TextField
          navFieldKey="freightTerms"
          label={t("purchaseOrder.fieldFreightTerms")}
          value={freightTerms}
          onChangeText={setFreightTerms}
          maxLength={120}
        />
        <TextField
          navFieldKey="deliveryLocation"
          label={t("purchaseOrder.fieldDeliveryLocation")}
          value={deliveryLocation}
          onChangeText={setDeliveryLocation}
          maxLength={160}
        />
        <TextField
          navFieldKey="notes"
          label={t("purchaseOrder.fieldNotes")}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={400}
        />
        <TextField
          navFieldKey="terms"
          label={t("purchaseOrder.fieldTerms")}
          hint={t("purchaseOrder.termsHint")}
          value={terms}
          onChangeText={setTerms}
          multiline
          maxLength={1200}
        />
      </FormSection>

      {/* --- Branding --- */}
      <FormSection title={t("purchaseOrder.sectionBranding")} style={styles.sectionGap}>
        {hasLogo ? (
          <View style={styles.switchRow}>
            <LocaleUiText style={styles.switchLabel}>{t("purchaseOrder.useLogo")}</LocaleUiText>
            <Switch value={useLogo} onValueChange={setUseLogo} />
          </View>
        ) : (
          <LocaleUiText style={styles.switchHint}>{t("purchaseOrder.noLogoHint")}</LocaleUiText>
        )}
      </FormSection>

      <View style={styles.actions}>
        <Button
          label={
            isEditing ? t("purchaseOrder.updateShare") : t("purchaseOrder.createShare")
          }
          loading={submitting}
          loadingLabel={t("purchaseOrder.generating")}
          onPress={onSubmit}
        />
      </View>
    </Screen>
  );
}
