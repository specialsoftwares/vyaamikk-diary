/**
 * Policy for when the offline india-pincode DB may be warmed.
 * Kept free of react-native imports so unit tests run under tsx/Node.
 */

/**
 * Calendar / You / Settings tab mount must never start the offline DB.
 * NativeTabs keeps all tab screens alive (freezeContents=false); warming on
 * Calendar mount previously froze every JS Pressable after login.
 */
export function shouldWarmIndiaPincodeOnCalendarTabMount(): boolean {
  return false;
}
