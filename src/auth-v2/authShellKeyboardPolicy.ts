/**
 * Auth/onboarding shell keyboard + Android hardware-back policy.
 * Keyboard must not steal Continue/Back; system back dismisses the keyboard first.
 */

export type AuthShellHardwareBackAction = "dismiss-keyboard" | "navigate-back";

export function resolveAuthShellHardwareBack(input: {
  keyboardVisible: boolean;
}): AuthShellHardwareBackAction {
  return input.keyboardVisible ? "dismiss-keyboard" : "navigate-back";
}

export function authShellKeyboardShouldPersistTaps(): "always" {
  return "always";
}

export function androidAuthShellFooterKeyboardPad(input: {
  platform: "ios" | "android" | string;
  keyboardHeight: number;
}): number {
  if (input.platform !== "android") return 0;
  return Math.max(0, input.keyboardHeight);
}
