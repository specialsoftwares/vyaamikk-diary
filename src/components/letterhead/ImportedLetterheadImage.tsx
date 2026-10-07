/**
 * Top-centred contain for imported letterhead pages.
 * Fits both frame width and height:
 *   scale = min(frameW/imgW, frameH/imgH)
 * then top-aligns and horizontally centres (never width-only clip).
 */

import React, { useState } from "react";
import {
  Image,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { computeImportedContainLayout } from "@/services/letterhead/letterheadImportedGeometry";
import { IMPORTED_PAGE_FIT } from "@/services/letterhead/letterheadVisualSpec";

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
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w <= 0 || h <= 0) return;
    setFrame((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  };

  const layout =
    frame != null
      ? computeImportedContainLayout({
          frameWidth: frame.w,
          frameHeight: frame.h,
          imageWidth: width,
          imageHeight: height,
        })
      : null;

  return (
    <View style={[styles.clip, style]} onLayout={onLayout}>
      {layout && layout.width > 0 && layout.height > 0 ? (
        <Image
          source={{ uri }}
          style={{
            position: "absolute",
            top: layout.top,
            left: layout.left,
            width: layout.width,
            height: layout.height,
          }}
          resizeMode={IMPORTED_PAGE_FIT}
          accessible={Boolean(accessibilityLabel)}
          accessibilityLabel={accessibilityLabel}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
});
