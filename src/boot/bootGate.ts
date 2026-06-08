/**
 * Prevents background sync from running until boot routing (and any draft sheet) is settled.
 */

let navigationSettled = false;

export function markBootNavigationSettled(): void {
  navigationSettled = true;
}

export function isBootNavigationSettled(): boolean {
  return navigationSettled;
}

export function resetBootNavigationSettledForTests(): void {
  navigationSettled = false;
}
