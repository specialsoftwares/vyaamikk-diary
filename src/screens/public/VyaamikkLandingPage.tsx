import React, { useCallback, useEffect, useRef } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingNavBar, type LandingSectionKey } from "@/components/landing/LandingNavBar";
import { LandingSecuritySection } from "@/components/landing/LandingSecuritySection";
import { LANDING_COLORS } from "@/components/landing/landingTokens";
import { TechnicalSuperioritySection } from "@/components/landing/TechnicalSuperioritySection";
import { TrustComplianceMatrix } from "@/components/landing/TrustComplianceMatrix";
import { ValuePropositionGrid } from "@/components/landing/ValuePropositionGrid";
import { authV2GradientStops } from "@/auth-v2/theme/authV2Theme";
import { BRAND_SURFACE } from "@/config/brandMotion";

const SEO_TITLE = "Vyaamikk Diary — Secure Business Records & Document Generation";
const SEO_DESCRIPTION =
  "Vyaamikk Diary helps Indian MSMEs and business owners create records, payment requests, purchase orders, customer credit ledgers, material movement notes and professional PDFs in a secure workspace.";

export function VyaamikkLandingPage() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Partial<Record<LandingSectionKey, number>>>({});

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.title = SEO_TITLE;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", SEO_DESCRIPTION);
  }, []);

  const recordSectionOffset = useCallback(
    (key: LandingSectionKey) => (event: LayoutChangeEvent) => {
      sectionOffsets.current[key] = event.nativeEvent.layout.y;
    },
    []
  );

  const navigateSection = useCallback((key: LandingSectionKey) => {
    const y = sectionOffsets.current[key] ?? 0;
    const target = Math.max(0, y - 72);
    scrollRef.current?.scrollTo({ y: target, animated: true });
  }, []);

  const gradient = authV2GradientStops(true);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[gradient[0], gradient[1], gradient[2], LANDING_COLORS.canvasBottom]}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: BRAND_SURFACE, opacity: 0.35 }]} />

      <LandingNavBar onNavigateSection={navigateSection} />

      <ScrollView
        ref={scrollRef}
        accessibilityRole="scrollbar"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={Platform.OS === "web"}
        style={styles.scroll}
      >
        <View onLayout={recordSectionOffset("platform")}>
          <LandingHero />
        </View>

        <View onLayout={recordSectionOffset("compliance")}>
          <TrustComplianceMatrix />
        </View>

        <View onLayout={recordSectionOffset("workflows")}>
          <ValuePropositionGrid />
        </View>

        <TechnicalSuperioritySection />

        <View onLayout={recordSectionOffset("security")}>
          <LandingSecuritySection />
        </View>

        <View onLayout={recordSectionOffset("contact")}>
          <LandingCTA />
        </View>

        <LandingFooter onNavigateSection={navigateSection} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LANDING_COLORS.canvas,
  },
  scroll: {
    flex: 1,
  },
});
