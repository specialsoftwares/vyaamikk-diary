import { Redirect } from "expo-router";

/**
 * Location Access UI is retired. Saved GPS on existing records and the
 * device-local footprint preference (including opt-out) are left untouched.
 * This redirect does not request permission and does not enable collection.
 */
export default function LocationFootprintsSettingsScreen() {
  return <Redirect href="/(app)/(tabs)/settings" />;
}
