import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Distance and route summaries are retired with the map. Old links open
 * Goods & Movement, which keeps quantities and status.
 */
export default function InsightsMovementScreen() {
  const { fy } = useLocalSearchParams<{ fy?: string | string[] }>();
  const raw = Array.isArray(fy) ? fy[0] : fy;
  const href = raw
    ? `/(app)/settings/business-insights/category/goods-movement?fy=${encodeURIComponent(raw)}`
    : "/(app)/settings/business-insights/category/goods-movement";
  return <Redirect href={href as never} />;
}
