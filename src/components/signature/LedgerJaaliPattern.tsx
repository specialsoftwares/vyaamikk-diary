import React, { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type PatternVariant = "jaali" | "ledger";

interface LedgerJaaliPatternProps {
  opacity?: number;
  color?: string;
  variant?: PatternVariant;
  style?: StyleProp<ViewStyle>;
}

/**
 * Faint Indian craft-inspired dot grid — static, lightweight, no SVG.
 */
function LedgerJaaliPatternInner({
  opacity = 0.04,
  color = "#3B41C5",
  variant = "jaali",
  style,
}: LedgerJaaliPatternProps) {
  const cols = variant === "ledger" ? 8 : 6;
  const rows = variant === "ledger" ? 3 : 4;
  const dotSize = variant === "ledger" ? 2 : 3;
  const gap = variant === "ledger" ? 10 : 8;

  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push(
        <View
          key={`${r}-${c}`}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize,
            backgroundColor: color,
            opacity,
            marginRight: gap,
            marginBottom: gap,
          }}
        />
      );
    }
  }

  return (
    <View pointerEvents="none" style={[styles.host, style]}>
      <View style={styles.grid}>{dots}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    position: "absolute",
    top: 8,
    right: 12,
    maxWidth: 120,
  },
});

export const LedgerJaaliPattern = memo(LedgerJaaliPatternInner);
