/**
 * Shared letterhead art for setup and the letter preview.
 * Header placement uses the same band height as the production PDF.
 * Complete page uses top-centred contain. Neither path stretches the image.
 */

import React from "react";
import { Image, StyleSheet, View } from "react-native";

import { ImportedLetterheadImage } from "@/components/letterhead/ImportedLetterheadImage";
import {
  headerBandHeightPct,
  type LetterheadPlacement,
} from "@/services/letterhead/letterheadPlacement";

export function LetterheadPageArt({
  uri,
  width,
  height,
  placement,
}: {
  uri: string;
  width?: number | null;
  height?: number | null;
  placement?: LetterheadPlacement | null;
}) {
  if (placement === "header_logo") {
    const band = headerBandHeightPct(width ?? 0, height ?? 0);
    return (
      <View style={[styles.header, { height: `${band}%` }]}>
        <Image source={{ uri }} style={styles.headerImage} resizeMode="contain" />
      </View>
    );
  }
  return <ImportedLetterheadImage uri={uri} width={width} height={height} />;
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
  },
  headerImage: {
    width: "100%",
    height: "100%",
  },
});
