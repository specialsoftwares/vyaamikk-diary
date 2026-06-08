import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { useTheme } from "@/theme";

/** Auth v2 onboarding surfaces always use the premium indigo shell (light-on-gradient). */
export function useAuthV2Theme() {
  const { colors } = useTheme();
  const tokens = authV2Tokens(colors, true);
  return { tokens };
}
