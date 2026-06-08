/**
 * Two-card premium intro — first launch only. RN Animated (Expo Go compatible).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";

import { BrandMomentsTagline } from "@/components/brand/BrandMomentsTagline";
import { useT } from "@/i18n";

import { INTRO_CARDS, type IntroCard } from "./introCards";
import { createIntroTheme, type IntroTheme } from "./introTheme";

type MciName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const LIQUID_OUT_MS = 380;
const LIQUID_IN_MS = 520;
const BRAND_IN_MS = 1100;

export interface VyaamikkIntroSplashProps {
  onFinish: () => void;
}

export function VyaamikkIntroSplash({ onFinish }: VyaamikkIntroSplashProps) {
  const t = useT();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const theme = useMemo(() => createIntroTheme(isDark), [isDark]);

  const [index, setIndex] = useState(0);
  const prevIndexRef = useRef(0);
  const transitioningRef = useRef(false);
  const indexRef = useRef(0);
  indexRef.current = index;

  const introOpacity = useRef(new Animated.Value(0)).current;
  const introScale = useRef(new Animated.Value(0.96)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  const cardAnims = useRef(
    INTRO_CARDS.map((_, i) => ({
      opacity: new Animated.Value(i === 0 ? 1 : 0),
      scale: new Animated.Value(i === 0 ? 1 : 0.94),
      translateY: new Animated.Value(i === 0 ? 0 : 14),
    }))
  ).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(introOpacity, {
        toValue: 1,
        duration: BRAND_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(introScale, {
        toValue: 1,
        duration: BRAND_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [introOpacity, introScale]);

  const runLiquidTransition = useCallback(
    (nextIndex: number, direction: "forward" | "back") => {
      const prev = prevIndexRef.current;
      if (prev === nextIndex || transitioningRef.current) return;

      transitioningRef.current = true;
      const out = cardAnims[prev];
      const inn = cardAnims[nextIndex];
      const outY = direction === "forward" ? -10 : 10;
      const inStartY = direction === "forward" ? 14 : -14;

      inn.opacity.setValue(0);
      inn.scale.setValue(0.94);
      inn.translateY.setValue(inStartY);

      Animated.parallel([
        Animated.timing(out.opacity, {
          toValue: 0,
          duration: LIQUID_OUT_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(out.scale, {
          toValue: 0.97,
          duration: LIQUID_OUT_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(out.translateY, {
          toValue: outY,
          duration: LIQUID_OUT_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(inn.opacity, {
          toValue: 1,
          duration: LIQUID_IN_MS,
          delay: 80,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(inn.scale, {
          toValue: 1,
          duration: LIQUID_IN_MS,
          delay: 80,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(inn.translateY, {
          toValue: 0,
          delay: 80,
          friction: 9,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start(() => {
        transitioningRef.current = false;
      });

      prevIndexRef.current = nextIndex;
      setIndex(nextIndex);
    },
    [cardAnims]
  );

  const goToCard = useCallback(
    (nextIndex: number) => {
      const current = indexRef.current;
      if (nextIndex === current) return;
      const direction = nextIndex > current ? "forward" : "back";
      runLiquidTransition(nextIndex, direction);
    },
    [runLiquidTransition]
  );

  function finishIntro() {
    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onFinish();
    });
  }

  function handleNext() {
    if (index < INTRO_CARDS.length - 1) {
      goToCard(index + 1);
    } else {
      finishIntro();
    }
  }

  function handlePrev() {
    if (index > 0) goToCard(index - 1);
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_, gesture) => {
          const i = indexRef.current;
          const last = INTRO_CARDS.length - 1;
          if (gesture.dx < -48 && i < last) goToCard(i + 1);
          else if (gesture.dx > 48 && i > 0) goToCard(i - 1);
        },
      }),
    [goToCard]
  );

  return (
    <Animated.View
      style={[
        styles.introRoot,
        { backgroundColor: theme.background, opacity: containerOpacity },
      ]}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.mainColumn}>
          {/* Header — fixed footprint so the card never overlaps the title */}
          <Animated.View
            style={[
              styles.headerBlock,
              {
                opacity: introOpacity,
                transform: [{ scale: introScale }],
              },
            ]}
          >
            <View
              style={[
                styles.logoMark,
                {
                  backgroundColor: theme.primary,
                  shadowColor: theme.arrowShadow,
                },
              ]}
            >
              {/* Replace with: require('../../../assets/icon.png') */}
              <MaterialCommunityIcons
                name="notebook-edit-outline"
                size={28}
                color="#FFFFFF"
              />
            </View>
            <LocaleUiText style={[styles.appName, { color: theme.text }]}>{t("app.name")}</LocaleUiText>
          </Animated.View>

          {/* Card stage — fixed min height, centered stack */}
          <View style={styles.cardStage} {...panResponder.panHandlers}>
            <View
              style={[
                styles.glassGlow,
                { backgroundColor: theme.primarySoft },
              ]}
            />
            {INTRO_CARDS.map((card, cardIndex) => {
              const anim = cardAnims[cardIndex];
              return (
                <Animated.View
                  key={card.key}
                  pointerEvents={cardIndex === index ? "auto" : "none"}
                  style={[
                    styles.cardLayer,
                    {
                      opacity: anim.opacity,
                      transform: [
                        { scale: anim.scale },
                        { translateY: anim.translateY },
                      ],
                    },
                  ]}
                >
                  <IntroBenefitCard card={card} theme={theme} />
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.dotsRow}>
            {INTRO_CARDS.map((card, dotIndex) => {
              const active = dotIndex === index;
              return (
                <Pressable
                  key={card.key}
                  onPress={() => goToCard(dotIndex)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Card ${dotIndex + 1} of ${INTRO_CARDS.length}`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <View
                    style={[
                      styles.dot,
                      {
                        width: active ? 20 : 6,
                        backgroundColor: active ? theme.primary : theme.inactiveDot,
                        opacity: active ? 1 : 0.7,
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footerBlock}>
            <BrandMomentsTagline
              compact
              style={{ marginBottom: 14, paddingHorizontal: 4 }}
            />
            <Text style={[styles.helperText, { color: theme.mutedText }]}>
              {index === INTRO_CARDS.length - 1
                ? "Swipe or tap back · Continue when ready"
                : index === 0
                  ? "Swipe or tap to continue"
                  : "Swipe left or right between cards"}
            </Text>

            <View style={styles.navRow}>
              {index > 0 ? (
                <Pressable
                  onPress={handlePrev}
                  hitSlop={16}
                  accessibilityRole="button"
                  accessibilityLabel="Previous card"
                  style={({ pressed }) => [
                    styles.arrowButton,
                    styles.arrowButtonGhost,
                    {
                      borderColor: theme.cardBorder,
                      backgroundColor: theme.pillBackground,
                      opacity: pressed ? 0.88 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    },
                  ]}
                >
                  <Ionicons name="arrow-back" size={22} color={theme.primary} />
                </Pressable>
              ) : (
                <View style={styles.navSideSpacer} />
              )}

              <Pressable
                onPress={handleNext}
                hitSlop={16}
                accessibilityRole="button"
                accessibilityLabel={
                  index === INTRO_CARDS.length - 1 ? "Continue to diary" : "Next card"
                }
                style={({ pressed }) => [
                  styles.arrowButton,
                  {
                    backgroundColor: theme.primary,
                    opacity: pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                    shadowColor: theme.arrowShadow,
                  },
                ]}
              >
                <Ionicons
                  name={
                    index === INTRO_CARDS.length - 1 ? "checkmark" : "arrow-forward"
                  }
                  size={22}
                  color="#FFFFFF"
                />
              </Pressable>

              <View style={styles.navSideSpacer} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

function IntroBenefitCard({ card, theme }: { card: IntroCard; theme: IntroTheme }) {
  return (
    <View
      style={[
        styles.infoCard,
        {
          backgroundColor: theme.cardGlass,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <View
        style={[
          styles.iconPill,
          {
            backgroundColor: theme.pillBackground,
            borderColor: theme.pillBorder,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={card.icon as MciName}
          size={18}
          color={theme.primary}
        />
        <Text style={[styles.pillText, { color: theme.primary }]}>{card.labelEn}</Text>
      </View>

      <Text style={[styles.cardTitle, { color: theme.text }]}>{card.titleEn}</Text>
      <Text style={[styles.cardTitleHi, { color: theme.secondaryText }]}>
        {card.titleHi}
      </Text>

      <View style={[styles.divider, { backgroundColor: theme.primary }]} />

      <Text style={[styles.cardBody, { color: theme.secondaryText }]}>{card.bodyEn}</Text>
      <Text style={[styles.cardBodyHi, { color: theme.mutedText }]}>{card.bodyHi}</Text>

      {card.highlightsEn && card.highlightsHi ? (
        <View style={styles.highlightsBlock}>
          {card.highlightsEn.map((line, i) => (
            <View key={line} style={styles.highlightItem}>
              <Text style={[styles.highlightEn, { color: theme.secondaryText }]}>
                {line}
              </Text>
              <Text style={[styles.highlightHi, { color: theme.mutedText }]}>
                {card.highlightsHi![i]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export { createIntroTheme, type IntroTheme };

const styles = StyleSheet.create({
  introRoot: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  mainColumn: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 20,
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBlock: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 20,
    width: "100%",
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  appName: {
    marginTop: 14,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  cardStage: {
    width: "100%",
    maxWidth: 360,
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  glassGlow: {
    position: "absolute",
    width: "88%",
    height: "72%",
    borderRadius: 40,
    opacity: 0.55,
  },
  cardLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCard: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  iconPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 16,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  cardTitleHi: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    textAlign: "center",
  },
  divider: {
    marginTop: 14,
    marginBottom: 14,
    width: 36,
    height: 2,
    borderRadius: 99,
    opacity: 0.55,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
    textAlign: "center",
    maxWidth: 300,
  },
  cardBodyHi: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "400",
    textAlign: "center",
    maxWidth: 300,
  },
  highlightsBlock: {
    marginTop: 16,
    width: "100%",
    gap: 12,
    alignItems: "center",
  },
  highlightItem: {
    alignItems: "center",
    width: "100%",
  },
  highlightEn: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    textAlign: "center",
  },
  highlightHi: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 20,
    marginBottom: 14,
  },
  dot: {
    height: 6,
    borderRadius: 999,
  },
  footerBlock: {
    alignItems: "center",
    width: "100%",
  },
  helperText: {
    marginBottom: 12,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.3,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    width: "100%",
  },
  navSideSpacer: {
    width: 54,
    height: 54,
  },
  arrowButtonGhost: {
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  arrowButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
});
