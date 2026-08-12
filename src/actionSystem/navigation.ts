/**
 * NavigationControl — sibling to ActionControl.
 * Back / Close / Skip are not forced into primary/secondary filled CTAs.
 */

export type NavigationKind = "back" | "close" | "skip";

export interface NavigationControlSpec {
  kind: NavigationKind;
  label?: string;
  disabled?: boolean;
  onPress?: () => void;
}

/** Maps navigation kinds to action purpose metadata (always `navigate`). */
export function navigationPurpose(): "navigate" {
  return "navigate";
}
