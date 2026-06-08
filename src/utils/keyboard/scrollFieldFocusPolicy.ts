/** Pure focus-scroll policy — safe to unit test without React Native. */
export function shouldScrollFieldOnFocus(keyboardHeight: number, reveal?: boolean): boolean {
  if (reveal) return true;
  return keyboardHeight > 0;
}
