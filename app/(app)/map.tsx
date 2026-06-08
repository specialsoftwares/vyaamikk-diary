import { Redirect } from "expo-router";

/** Legacy route — map is integrated into the Calendar tab. */
export default function MapRedirectScreen() {
  return <Redirect href="/(app)/(tabs)/calendar" />;
}
