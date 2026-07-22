/**
 * Same-physical-device recognition limitations (honest contract).
 *
 * The approved implementation uses installation/platform identifiers
 * (`deviceInstallationId` in SecureStore), not hardware-backed device keys.
 * Continuity cannot be guaranteed after reinstall, secure storage loss,
 * factory reset, or OS reset. When certainty is unavailable, treat as a new device.
 */

export type PhysicalDeviceRecognition =
  | "same_install_confident"
  | "uncertain_treat_as_new"
  | "different_install";

export function classifyPhysicalDeviceRecognition(input: {
  currentInstallationId: string | null;
  previousActiveInstallationId: string | null;
}): PhysicalDeviceRecognition {
  if (!input.currentInstallationId || !input.previousActiveInstallationId) {
    return "uncertain_treat_as_new";
  }
  if (input.currentInstallationId === input.previousActiveInstallationId) {
    return "same_install_confident";
  }
  return "different_install";
}

export const PHYSICAL_DEVICE_RECOGNITION_LIMITATION =
  "Best-effort same-physical-device recognition cannot be guaranteed using installation/platform identifiers after reinstall or secure-state loss.";
