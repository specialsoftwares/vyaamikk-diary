import { isMaterialMovementComposerType } from "@/domain/materialMovement";

/** When a composer / letterhead / pro-pack screen pops back to You, reopen + New Record picker. */
export type ComposerPickerReturnMode = "picker" | "work_team" | "material_movement";

let pending: ComposerPickerReturnMode | null = null;

export function requestComposerPickerReturn(mode: ComposerPickerReturnMode): void {
  pending = mode;
}

export function consumeComposerPickerReturn(): ComposerPickerReturnMode | null {
  const mode = pending;
  pending = null;
  return mode;
}

/** Work & Team sub-types opened from the picker sheet. */
export function isWorkTeamComposerType(type: string): boolean {
  return type === "work_update_issue" || type === "staff_matter";
}

export function pickerReturnParamForType(type: string): ComposerPickerReturnMode {
  if (isWorkTeamComposerType(type)) return "work_team";
  if (isMaterialMovementComposerType(type)) return "material_movement";
  return "picker";
}
