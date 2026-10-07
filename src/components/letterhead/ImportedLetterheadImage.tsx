/**
 * Top-centred contain for imported letterhead pages.
 * RN `resizeMode="contain"` with a full-frame height centres vertically;
 * we size the image by aspect ratio and pin it to the top instead.
 */

import React from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { IMPORTED_PAGE_FIT, LETTERHEAD_A4_ASPECT } from "@/services/letterhead/letterheadVisualSpec";

export interface ImportedLetterheadImageProps {
  uri: string;
  /** Intrinsic pixels when known — used for aspect; falls back to A4. */
  width?: number | null;
  height?: number | null;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function ImportedLetterheadImage({
  uri,
  width,
  height,
  style,
  accessibilityLabel,
}: ImportedLetterheadImageProps) {
  const aspect =
    width && height && width > 0 && height > 0 ? width / height : LETTERHEAD_A4_ASPECT;

  return (
    <View style={[styles.clip, style]}>
      <Image
        source={{ uri }}
        style={[styles.image, { aspectRatio: aspect }]}
        resizeMode={IMPORTED_PAGE_FIT}
        accessible={Boolean(accessibilityLabel)}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  image: {
    width: "100%",
  },
});
