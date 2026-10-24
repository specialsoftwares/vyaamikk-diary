import { Redirect } from "expo-router";

/**
 * Business PINs and the map are retired. This route stays so old links open
 * the VyaaFlow calendar tab.
 */
export default function InsightsPinsScreen() {
  return <Redirect href="/(app)/(tabs)/calendar" />;
}
