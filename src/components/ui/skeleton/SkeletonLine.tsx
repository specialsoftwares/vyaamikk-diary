import React, { memo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { spacing } from "@/theme";

import { SkeletonBase, type SkeletonBaseProps } from "./SkeletonBase";

export interface SkeletonLineProps extends Omit<SkeletonBaseProps, "height"> {
  /** Line height in px (default 12). */
  size?: "caption" | "body" | "title";
  widthPct?: number;
  style?: StyleProp<ViewStyle>;
}

const HEIGHTS = { caption: 10, body: 12, title: 16 } as const;

export const SkeletonLine = memo(function SkeletonLine({
  size = "body",
  widthPct = 100,
  borderRadius,
  style,
  width,
}: SkeletonLineProps) {
  return (
    <View style={[{ marginBottom: spacing.xs }, style]}>
      <SkeletonBase
        width={width ?? `${widthPct}%`}
        height={HEIGHTS[size]}
        borderRadius={borderRadius}
      />
    </View>
  );
});
