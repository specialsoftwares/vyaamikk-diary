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

export type MaterialMovementDestination =
  | MaterialMovementComposerDestination
  | MaterialMovementGrinDestination;

/**
 * Destinations shown under + New Record → Material Movement.
 * GRIN appears only when goods-evidence admission is enabled; picking it never
 * routes through the basic material_received composer path.
 */
export function materialMovementDestinations(options: {
  goodsEvidenceEnabled: boolean;
}): MaterialMovementDestination[] {
  const composer: MaterialMovementDestination[] = MATERIAL_MOVEMENT_SUB_OPTIONS.map((opt) => ({
    kind: "composer" as const,
    movementKind: opt.kind,
    entryType: entryTypeForMovementKind(opt.kind),
    pathname: "/(app)/composer/[type]" as const,
  }));
  if (!options.goodsEvidenceEnabled) return composer;
  return [
    ...composer,
    {
      kind: "grin_create",
      id: MATERIAL_MOVEMENT_GRIN_OPTION.id,
      pathname: "/(app)/grin/create",
    },
  ];
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
