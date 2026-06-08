import type { BusinessEntryType } from "./businessEntry";
import type { MaterialMovementKind } from "./materialMovement";
import { entryTypeFromMovementKind } from "./materialMovement";

export interface ComposerOption {
  type: BusinessEntryType;
  /** i18n key under composer.options.* */
  labelKey: string;
  subtitleKey: string;
  /** Routes into letterhead module instead of generic composer form. */
  routesToLetterhead?: boolean;
}

/** Sub-types under Work & team (+ New record drill-down). */
export interface WorkTeamSubOption {
  type: BusinessEntryType;
  labelKey: string;
  subtitleKey: string;
}

/** Business-purpose composer options — no generic "Other". */
export const COMPOSER_OPTIONS: ComposerOption[] = [
  {
    type: "letterhead_matter",
    labelKey: "letterheadMatter",
    subtitleKey: "letterheadMatterSub",
    routesToLetterhead: true,
  },
  {
    type: "business_cash_given",
    labelKey: "cashGiven",
    subtitleKey: "cashGivenSub",
  },
  {
    type: "payment_request",
    labelKey: "paymentRequest",
    subtitleKey: "paymentRequestSub",
  },
];

/** Leading row in the + picker (not a BusinessEntryType). */
export const COMPOSER_PICKER_PRO_PACK = {
  labelKey: "professionalPack",
  subtitleKey: "professionalPackSub",
} as const;

/** Purchase Order row in the + picker (routes to the dedicated PO module). */
export const COMPOSER_PICKER_PURCHASE_ORDER = {
  labelKey: "purchaseOrder",
  subtitleKey: "purchaseOrderSub",
} as const;

/** Customer Credit / EMI row in the + picker (routes to the dedicated module). */
export const COMPOSER_PICKER_CUSTOMER_CREDIT = {
  labelKey: "customerCredit",
  subtitleKey: "customerCreditSub",
} as const;

/** Work & team umbrella in the + picker (not a BusinessEntryType). */
export const COMPOSER_PICKER_WORK_TEAM = {
  labelKey: "workAndTeam",
  subtitleKey: "workAndTeamSub",
} as const;

/** Material Movement umbrella — dispatch, receipt, freight, return (not one entry type). */
export const COMPOSER_PICKER_MATERIAL_MOVEMENT = {
  labelKey: "materialMovement",
  subtitleKey: "materialMovementSub",
} as const;

export interface MaterialMovementSubOption {
  kind: MaterialMovementKind;
  labelKey: string;
  subtitleKey: string;
}

export const MATERIAL_MOVEMENT_SUB_OPTIONS: MaterialMovementSubOption[] = [
  {
    kind: "sent_transport",
    labelKey: "movementSentTransport",
    subtitleKey: "movementSentTransportSub",
  },
  {
    kind: "received",
    labelKey: "movementReceived",
    subtitleKey: "movementReceivedSub",
  },
  {
    kind: "return",
    labelKey: "movementReturn",
    subtitleKey: "movementReturnSub",
  },
];

export function entryTypeForMovementKind(kind: MaterialMovementKind): BusinessEntryType {
  return entryTypeFromMovementKind(kind);
}

export const WORK_TEAM_SUB_OPTIONS: WorkTeamSubOption[] = [
  {
    type: "work_update_issue",
    labelKey: "workUpdate",
    subtitleKey: "workUpdateSub",
  },
  {
    type: "staff_matter",
    labelKey: "staffMatter",
    subtitleKey: "staffMatterSub",
  },
];

const COMPOSER_ENTRY_TYPES: BusinessEntryType[] = [
  ...COMPOSER_OPTIONS.map((o) => o.type),
  ...WORK_TEAM_SUB_OPTIONS.map((o) => o.type),
  "material_dispatched",
  "material_received",
  "outward_freight_details",
  "material_return",
];

/** Diary type filter pills — movement types grouped under one virtual filter key. */
export const DIARY_ENTRY_TYPE_FILTERS: Array<{
  type: BusinessEntryType | "material_movement";
  labelKey: string;
}> = [
  ...WORK_TEAM_SUB_OPTIONS.map((o) => ({ type: o.type, labelKey: o.labelKey })),
  ...COMPOSER_OPTIONS.map((o) => ({ type: o.type, labelKey: o.labelKey })),
  { type: "material_movement", labelKey: "materialMovement" },
];

export function isComposerEntryType(value: string): value is BusinessEntryType {
  return COMPOSER_ENTRY_TYPES.includes(value as BusinessEntryType);
}

export function composerOptionForType(
  type: BusinessEntryType
): ComposerOption | WorkTeamSubOption | MaterialMovementSubOption | undefined {
  const movementKind =
    type === "material_dispatched" || type === "outward_freight_details"
      ? ("sent_transport" as const)
      : null;
  const movement =
    movementKind != null
      ? MATERIAL_MOVEMENT_SUB_OPTIONS.find((o) => o.kind === movementKind)
      : MATERIAL_MOVEMENT_SUB_OPTIONS.find(
          (o) => entryTypeFromMovementKind(o.kind) === type
        );
  if (movement) return movement;
  return (
    COMPOSER_OPTIONS.find((o) => o.type === type) ??
    WORK_TEAM_SUB_OPTIONS.find((o) => o.type === type)
  );
}
