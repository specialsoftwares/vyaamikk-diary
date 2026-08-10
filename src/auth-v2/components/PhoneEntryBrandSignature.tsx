import React, { useEffect, useState } from "react";
import { Dimensions, Keyboard, StyleSheet, Text, View } from "react-native";

import {
  PHONE_ENTRY_BRAND_COLORS,
  PHONE_ENTRY_BRAND_TAGLINE,
  PHONE_ENTRY_PROVENANCE_LINE_1,
  PHONE_ENTRY_PROVENANCE_LINE_2,
  shouldShowPhoneEntryBrand,
  shouldShowPhoneEntryProvenance,
} from "@/auth-v2/components/phoneEntryBrandModel";
import { LedgerVMarkSvg } from "@/components/boot/LedgerVMarkSvg";
import { leftArmLength } from "@/components/boot/ledgerVMarkGeometry";

const ARM_LEN = leftArmLength();
const MARK_SIZE = 26;

export function PhoneEntryBrandSignature() {
  const windowHeight = Dimensions.get("window").height;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = () => setKeyboardVisible(true);
    const hide = () => setKeyboardVisible(false);
    const subShow = Keyboard.addListener("keyboardDidShow", show);
    const subHide = Keyboard.addListener("keyboardDidHide", hide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  if (!shouldShowPhoneEntryBrand({ keyboardVisible })) return null;
  const showProvenance = shouldShowPhoneEntryProvenance({ keyboardVisible, windowHeight });

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Vyaamikk Diary. ${PHONE_ENTRY_BRAND_TAGLINE}. ${PHONE_ENTRY_PROVENANCE_LINE_1}. ${PHONE_ENTRY_PROVENANCE_LINE_2}`}
      style={styles.wrap}
      testID="phone-entry-brand-signature"
    >
      <LedgerVMarkSvg
        size={MARK_SIZE}
        tracerX={0}
        tracerY={0}
        tracerVisible={false}
        goldOpacity={0.38}
        leftTrailLen={0}
        rightTrailLen={0}
        leftArmLen={ARM_LEN}
        strokeColor={PHONE_ENTRY_BRAND_COLORS.markStroke}
        cutFill={PHONE_ENTRY_BRAND_COLORS.markCut}
      />
      <Text style={styles.vyaamikk}>VYAAMIKK</Text>
      <Text style={styles.diary}>DIARY</Text>
      <View style={styles.rule} />
      <Text style={styles.tagline} numberOfLines={1}>
        {PHONE_ENTRY_BRAND_TAGLINE}
      </Text>
      {showProvenance ? (
        <View style={styles.provenance} testID="phone-entry-provenance">
          <Text style={styles.provenancePrimary} numberOfLines={1}>
            {PHONE_ENTRY_PROVENANCE_LINE_1}
          </Text>
          <Text style={styles.provenanceSecondary} numberOfLines={1}>
            {PHONE_ENTRY_PROVENANCE_LINE_2}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
    gap: 3,
  },
  vyaamikk: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.6,
    color: PHONE_ENTRY_BRAND_COLORS.wordmark,
    includeFontPadding: false,
  },
  diary: {
    fontSize: 8,
    fontWeight: "300",
    letterSpacing: 5.2,
    color: PHONE_ENTRY_BRAND_COLORS.diary,
    textTransform: "uppercase",
    includeFontPadding: false,
  },
  rule: {
    marginTop: 5,
    width: 36,
    height: StyleSheet.hairlineWidth,
    backgroundColor: PHONE_ENTRY_BRAND_COLORS.rule,
  },
  tagline: {
    marginTop: 5,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.4,
    color: PHONE_ENTRY_BRAND_COLORS.tagline,
    textTransform: "uppercase",
    textAlign: "center",
    includeFontPadding: false,
  },
  provenance: {
    marginTop: 32,
    alignItems: "center",
    gap: 4,
  },
  provenancePrimary: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1.3,
    color: PHONE_ENTRY_BRAND_COLORS.provenancePrimary,
    textTransform: "uppercase",
    textAlign: "center",
    includeFontPadding: false,
  },
  provenanceSecondary: {
    fontSize: 7,
    fontWeight: "500",
    letterSpacing: 1.6,
    color: PHONE_ENTRY_BRAND_COLORS.provenanceSecondary,
    textTransform: "uppercase",
    textAlign: "center",
    includeFontPadding: false,
  },
});
