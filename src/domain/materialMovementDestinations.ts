import {
  MATERIAL_MOVEMENT_GRIN_OPTION,
  MATERIAL_MOVEMENT_SUB_OPTIONS,
  entryTypeForMovementKind,
} from "./composerOptions";
import type { MaterialMovementKind } from "./materialMovement";

export type MaterialMovementComposerDestination = {
  kind: "composer";
  movementKind: MaterialMovementKind;
  entryType: ReturnType<typeof entryTypeForMovementKind>;
  pathname: "/(app)/composer/[type]";
};

export type MaterialMovementGrinDestination = {
  kind: "grin_create";
  id: typeof MATERIAL_MOVEMENT_GRIN_OPTION.id;
  pathname: "/(app)/grin/create";
};

export type MaterialMovementGrinReturnDestination = {
  kind: "grin_return_select";
  id: "grin_return_select";
  pathname: "/(app)/grin/return-select";
};

export type MaterialMovementDestination =
  | MaterialMovementComposerDestination
  | MaterialMovementGrinDestination
  | MaterialMovementGrinReturnDestination;

/**
 * Destinations shown under + New Record → Material Movement.
 *
 * When goods-evidence is admitted: one receiving entry (GRIN create). Basic
 * `material_received` is omitted from *new* entry choices so it does not compete
 * with GRIN. Historical basic records remain readable via diary/Saved Records.
 * Return uses GRIN receipt selection when admitted; otherwise the legacy composer.
 *
 * When not admitted: legacy composer destinations only (including basic received).
 * Never silently fall back from a GRIN menu item to basic `material_received`.
 */
export function materialMovementDestinations(options: {
  goodsEvidenceEnabled: boolean;
}): MaterialMovementDestination[] {
  if (!options.goodsEvidenceEnabled) {
    return MATERIAL_MOVEMENT_SUB_OPTIONS.map((opt) => ({
      kind: "composer" as const,
      movementKind: opt.kind,
      entryType: entryTypeForMovementKind(opt.kind),
      pathname: "/(app)/composer/[type]" as const,
    }));
  }

  const out: MaterialMovementDestination[] = [];
  for (const opt of MATERIAL_MOVEMENT_SUB_OPTIONS) {
    if (opt.kind === "received") {
      // Unified receiving → admitted GRIN create (not basic composer).
      out.push({
        kind: "grin_create",
        id: MATERIAL_MOVEMENT_GRIN_OPTION.id,
        pathname: "/(app)/grin/create",
      });
      continue;
    }
    if (opt.kind === "return") {
      out.push({
        kind: "grin_return_select",
        id: "grin_return_select",
        pathname: "/(app)/grin/return-select",
      });
      continue;
    }
    out.push({
      kind: "composer",
      movementKind: opt.kind,
      entryType: entryTypeForMovementKind(opt.kind),
      pathname: "/(app)/composer/[type]",
    });
  }
  return out;
}

export function materialMovementGrinDestination(
  goodsEvidenceEnabled: boolean
): MaterialMovementGrinDestination | null {
  if (!goodsEvidenceEnabled) return null;
  return {
    kind: "grin_create",
    id: MATERIAL_MOVEMENT_GRIN_OPTION.id,
    pathname: "/(app)/grin/create",
  };
}

/** Legacy basic received remains a valid composer type for old deep links / drafts. */
export function legacyBasicReceivedComposerDestination(): MaterialMovementComposerDestination {
  return {
    kind: "composer",
    movementKind: "received",
    entryType: "material_received",
    pathname: "/(app)/composer/[type]",
  };
}
