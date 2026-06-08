import React, { memo, type ComponentType } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { spacing } from "@/theme";

import { SkeletonSearchResult } from "./SkeletonSearchResult";

export interface SkeletonListProps {
  count?: number;
  /** Defaults to search/record row shape. */
  Item?: ComponentType;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonList = memo(function SkeletonList({
  count = 6,
  Item = SkeletonSearchResult,
  gap = spacing.sm,
  style,
}: SkeletonListProps) {
  return (
    <View style={[styles.list, { gap }, style]} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Item key={i} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  list: {
    width: "100%",
  },
});
