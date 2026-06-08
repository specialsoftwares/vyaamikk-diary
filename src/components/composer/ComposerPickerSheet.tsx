import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  COMPOSER_OPTIONS,
  COMPOSER_PICKER_CUSTOMER_CREDIT,
  COMPOSER_PICKER_PRO_PACK,
  COMPOSER_PICKER_PURCHASE_ORDER,
  COMPOSER_PICKER_MATERIAL_MOVEMENT,
  COMPOSER_PICKER_WORK_TEAM,
  WORK_TEAM_SUB_OPTIONS,
} from "@/domain/composerOptions";
import type { BusinessEntryType } from "@/domain/businessEntry";
import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { CurtainSheet, type CurtainSheetHandle } from "@/components/ui/CurtainSheet";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";
import { accentKeyForComposerPickerKey } from "@/theme/categoryAccentResolver";
import { useCategoryAccent } from "@/theme/useBrandTokens";
import type { CategoryAccentKey } from "@/theme/categoryAccents";

/** Light-on-dark tokens for the record picker curtain surface. */
const CURTAIN_TEXT = "#F2F3F8";
const CURTAIN_TEXT_MUTED = "rgba(255,255,255,0.72)";
const CURTAIN_TEXT_SUBTLE = "rgba(255,255,255,0.48)";
const CURTAIN_ROW_BG = "rgba(255,255,255,0.06)";
const CURTAIN_ROW_BORDER = "rgba(255,255,255,0.12)";
const CURTAIN_ROW_ACTIVE_BG = "rgba(99,102,241,0.22)";
const CURTAIN_DIVIDER = "rgba(255,255,255,0.1)";

interface ComposerPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (
    type:
      | BusinessEntryType
      | "professional_pack"
      | "purchase_order"
      | "customer_credit"
      | "material_movement",
    routesToLetterhead?: boolean,
    routesToProfessionalPack?: boolean,
    routesToPurchaseOrder?: boolean,
    routesToCustomerCredit?: boolean
  ) => void;
  /** Reopen with Work & Team sub-list expanded (back from staff/work form). */
  initialWorkTeamExpanded?: boolean;
}

type PickerRow = {
  key: string;
  labelKey: string;
  subtitleKey: string;
  onPress: () => void;
};

export function ComposerPickerSheet({
  visible,
  onClose,
  onPick,
  initialWorkTeamExpanded = false,
}: ComposerPickerSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const scrollBottom = insets.bottom + spacing.lg;
  const curtainRef = useRef<CurtainSheetHandle>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const [workTeamExpanded, setWorkTeamExpanded] = useState(false);
  const prevVisibleRef = useRef(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sheetHeader: {
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
          alignSelf: "stretch",
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: CURTAIN_DIVIDER,
        },
        sheetTitle: {
          ...typography.titleMd,
          color: CURTAIN_TEXT,
          alignSelf: "stretch",
          letterSpacing: -0.35,
        },
        sheetScroll: { flex: 1 },
        categoryList: { gap: spacing.sm + 2, paddingHorizontal: spacing.lg },
        categoryRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: spacing.md + 2,
          paddingHorizontal: spacing.md + 2,
          borderRadius: 16,
          backgroundColor: CURTAIN_ROW_BG,
          borderWidth: 1,
          borderColor: CURTAIN_ROW_BORDER,
          gap: spacing.sm,
        },
        categoryRowExpanded: {
          borderColor: "rgba(139,145,255,0.45)",
          backgroundColor: CURTAIN_ROW_ACTIVE_BG,
        },
        subRow: {
          marginLeft: spacing.md,
          borderColor: CURTAIN_ROW_BORDER,
          backgroundColor: "rgba(255,255,255,0.04)",
        },
        categoryCopy: { flex: 1, gap: 2 },
        categoryLabel: { ...typography.bodyStrong, color: CURTAIN_TEXT },
        categorySub: { ...typography.caption, color: CURTAIN_TEXT_MUTED },
        categoryChevron: { ...typography.titleMd, color: CURTAIN_TEXT_SUBTLE },
        groupHeader: {
          ...typography.captionStrong,
          color: CURTAIN_TEXT_MUTED,
          textTransform: "uppercase",
          letterSpacing: 0.55,
          fontWeight: "700",
          marginTop: spacing.md,
          marginBottom: spacing.xs,
        },
        groupRows: { gap: spacing.sm },
      }),
    []
  );

  const workTeamSubRows: PickerRow[] = useMemo(
    () =>
      WORK_TEAM_SUB_OPTIONS.map((opt) => ({
        key: opt.type,
        labelKey: opt.labelKey,
        subtitleKey: opt.subtitleKey,
        onPress: () => onPickRef.current(opt.type),
      })),
    []
  );

  const rowByKey: Record<string, PickerRow> = useMemo(() => {
    const map: Record<string, PickerRow> = {
      professional_pack: {
        key: "professional_pack",
        labelKey: COMPOSER_PICKER_PRO_PACK.labelKey,
        subtitleKey: COMPOSER_PICKER_PRO_PACK.subtitleKey,
        onPress: () => onPickRef.current("professional_pack", false, true),
      },
      purchase_order: {
        key: "purchase_order",
        labelKey: COMPOSER_PICKER_PURCHASE_ORDER.labelKey,
        subtitleKey: COMPOSER_PICKER_PURCHASE_ORDER.subtitleKey,
        onPress: () => onPickRef.current("purchase_order", false, false, true),
      },
      customer_credit: {
        key: "customer_credit",
        labelKey: COMPOSER_PICKER_CUSTOMER_CREDIT.labelKey,
        subtitleKey: COMPOSER_PICKER_CUSTOMER_CREDIT.subtitleKey,
        onPress: () => onPickRef.current("customer_credit", false, false, false, true),
      },
      work_team: {
        key: "work_team",
        labelKey: COMPOSER_PICKER_WORK_TEAM.labelKey,
        subtitleKey: COMPOSER_PICKER_WORK_TEAM.subtitleKey,
        onPress: () => {},
      },
      material_movement: {
        key: "material_movement",
        labelKey: COMPOSER_PICKER_MATERIAL_MOVEMENT.labelKey,
        subtitleKey: COMPOSER_PICKER_MATERIAL_MOVEMENT.subtitleKey,
        onPress: () => onPickRef.current("material_movement"),
      },
    };
    for (const opt of COMPOSER_OPTIONS) {
      map[opt.type] = {
        key: opt.type,
        labelKey: opt.labelKey,
        subtitleKey: opt.subtitleKey,
        onPress: () => onPickRef.current(opt.type, opt.routesToLetterhead),
      };
    }
    for (const opt of WORK_TEAM_SUB_OPTIONS) {
      map[opt.type] = {
        key: opt.type,
        labelKey: opt.labelKey,
        subtitleKey: opt.subtitleKey,
        onPress: () => onPickRef.current(opt.type),
      };
    }
    return map;
  }, []);

  const groups = useMemo(
    () => [
      {
        titleKey: "composer.groups.business",
        keys: [
          "payment_request",
          "business_cash_given",
          "customer_credit",
          "purchase_order",
        ],
      },
      { titleKey: "composer.groups.materialMovement", keys: ["material_movement"] },
      { titleKey: "composer.groups.workTeam", keys: ["work_team"] },
      { titleKey: "composer.groups.documents", keys: ["letterhead_matter", "professional_pack"] },
    ],
    []
  );

  const resetPickerState = useCallback(() => {
    setWorkTeamExpanded(false);
  }, []);

  useEffect(() => {
    const opening = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (opening) {
      resetPickerState();
      if (initialWorkTeamExpanded) {
        setWorkTeamExpanded(true);
      }
    }
  }, [visible, resetPickerState, initialWorkTeamExpanded]);

  const handleHardwareBack = useCallback(() => {
    if (workTeamExpanded) {
      setWorkTeamExpanded(false);
      return true;
    }
    return false;
  }, [workTeamExpanded]);

  const pickRow = useCallback((row: PickerRow) => {
    curtainRef.current?.close(row.onPress);
  }, []);

  const renderRow = (row: PickerRow, variant: "main" | "sub", keyPrefix: string = variant) => {
    const accentKey = accentKeyForComposerPickerKey(row.key);
    return (
      <ComposerPickerRow
        key={`${keyPrefix}-${row.key}`}
        row={row}
        variant={variant}
        accentKey={accentKey}
        workTeamExpanded={workTeamExpanded}
        styles={styles}
        onPress={() => {
          if (row.key === "work_team") {
            setWorkTeamExpanded((v) => !v);
            return;
          }
          pickRow(row);
        }}
        label={t(`composer.options.${row.labelKey}`)}
        subtitle={t(`composer.options.${row.subtitleKey}`)}
        chevron={row.key === "work_team" ? (workTeamExpanded ? "˅" : "›") : ">"}
      />
    );
  };

  return (
    <CurtainSheet
      ref={curtainRef}
      visible={visible}
      onClose={onClose}
      onHardwareBack={handleHardwareBack}
      accessibilityLabel={t("you.pickerHeadline")}
      header={
        <View style={styles.sheetHeader}>
          <LocaleUiText style={styles.sheetTitle}>{t("you.pickerHeadline")}</LocaleUiText>
        </View>
      }
    >
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={[styles.categoryList, { paddingBottom: scrollBottom }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {groups.map((group) => (
          <View key={group.titleKey}>
            <LocaleUiText style={styles.groupHeader}>{t(group.titleKey)}</LocaleUiText>
            <View style={styles.groupRows}>
              {group.keys
                .map((k) => rowByKey[k])
                .filter((r): r is PickerRow => Boolean(r))
                .map((row) => (
                  <View key={row.key} style={styles.groupRows}>
                    {renderRow(row, "main")}
                    {row.key === "work_team" && workTeamExpanded
                      ? workTeamSubRows.map((sub) => renderRow(sub, "sub"))
                      : null}
                  </View>
                ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </CurtainSheet>
  );
}

function ComposerPickerRow({
  row,
  variant,
  accentKey,
  workTeamExpanded,
  styles,
  onPress,
  label,
  subtitle,
  chevron,
}: {
  row: PickerRow;
  variant: "main" | "sub";
  accentKey: CategoryAccentKey;
  workTeamExpanded: boolean;
  styles: {
    categoryRow: object;
    subRow: object;
    categoryRowExpanded: object;
    categoryCopy: object;
    categoryLabel: object;
    categorySub: object;
    categoryChevron: object;
  };
  onPress: () => void;
  label: string;
  subtitle: string;
  chevron: string;
}) {
  const accent = useCategoryAccent(accentKey);
  const expanded = variant === "main" && row.key === "work_team" && workTeamExpanded;
  return (
    <LuxuryPressable
      style={[
        styles.categoryRow,
        variant === "sub" ? styles.subRow : null,
        expanded ? styles.categoryRowExpanded : null,
        !expanded && { borderLeftWidth: 3, borderLeftColor: accent.main },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.categoryCopy}>
        <Text style={styles.categoryLabel}>{label}</Text>
        <Text style={styles.categorySub} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Text style={styles.categoryChevron}>{chevron}</Text>
    </LuxuryPressable>
  );
}
