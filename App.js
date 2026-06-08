/**
 * Standalone intro + boot sample for Expo Go experiments.
 *
 * This project’s real entry is `expo-router/entry` (see package.json `main`).
 * Production flow: native splash → `app/index.tsx` → VyaamikkIntroSplash (first time)
 * → login / profile / `/(tabs)/you`.
 *
 * To try this file temporarily: set `"main": "./App.js"` in package.json.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

SplashScreen.preventAutoHideAsync().catch(() => {});

const INTRO_CARDS = [
  {
    key: "records",
    icon: "file-document-edit-outline",
    titleEn: "Create business records with clarity",
    titleHi: "अपने व्यापारिक रिकॉर्ड साफ़ और व्यवस्थित रखें",
    bodyEn:
      "Save work updates, payment requests, freight details, staff notes, material records and reminders in one professional diary.",
    bodyHi:
      "वर्क अपडेट, पेमेंट रिक्वेस्ट, फ्रेट डिटेल्स, स्टाफ नोट्स, मटेरियल रिकॉर्ड और रिमाइंडर एक प्रोफेशनल डायरी में रखें।",
  },
  {
    key: "pdfs",
    icon: "file-pdf-box",
    titleEn: "Generate professional PDFs",
    titleHi: "प्रोफेशनल PDF तुरंत बनाएं",
    bodyEn:
      "Export clean A4 PDFs with your name, business identity, Vyaamikk ID, document history and footer disclaimer.",
    bodyHi:
      "अपने नाम, बिज़नेस पहचान, Vyaamikk ID, डॉक्यूमेंट हिस्ट्री और फुटर डिस्क्लेमर के साथ साफ़ A4 PDF बनाएं।",
  },
];

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const [appReady, setAppReady] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const theme = useMemo(() => createTheme(isDark), [isDark]);

  useEffect(() => {
    let mounted = true;
    async function prepareApp() {
      try {
        await new Promise((resolve) => setTimeout(resolve, 450));
      } finally {
        if (mounted) {
          setAppReady(true);
          await SplashScreen.hideAsync();
        }
      }
    }
    prepareApp();
    return () => {
      mounted = false;
    };
  }, []);

  if (!appReady) return null;

  return (
    <View style={[styles.appRoot, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {showIntro ? (
        <VyaamikkIntroSplash theme={theme} onFinish={() => setShowIntro(false)} />
      ) : (
        <MainAppPlaceholder theme={theme} />
      )}
    </View>
  );
}

function VyaamikkIntroSplash({ theme, onFinish }) {
  const [index, setIndex] = useState(0);
  const currentCard = INTRO_CARDS[index];
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introScale = useRef(new Animated.Value(0.9)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(introOpacity, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(introScale, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [introOpacity, introScale]);

  function animateCardChange(nextIndex) {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 8,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIndex(nextIndex);
      cardTranslateY.setValue(8);
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardTranslateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }

  function finishIntro() {
    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onFinish();
    });
  }

  function handleNext() {
    if (index < INTRO_CARDS.length - 1) animateCardChange(index + 1);
    else finishIntro();
  }

  return (
    <Animated.View
      style={[
        styles.introRoot,
        { backgroundColor: theme.background, opacity: containerOpacity },
      ]}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <View />
          <Pressable
            onPress={finishIntro}
            hitSlop={12}
            style={({ pressed }) => [
              styles.skipButton,
              {
                backgroundColor: theme.skipBackground,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text style={[styles.skipText, { color: theme.secondaryText }]}>Skip</Text>
          </Pressable>
        </View>

        <Animated.View
          style={[
            styles.brandBlock,
            { opacity: introOpacity, transform: [{ scale: introScale }] },
          ]}
        >
          <View
            style={[
              styles.logoMark,
              { backgroundColor: theme.primary, shadowColor: theme.primary },
            ]}
          >
            <MaterialCommunityIcons
              name="notebook-edit-outline"
              size={34}
              color="#FFFFFF"
            />
          </View>
          <Text style={[styles.appName, { color: theme.text }]}>Vyaamikk Diary</Text>
          <Text style={[styles.brandLine, { color: theme.secondaryText }]}>
            by SPECIAL SOFTWARES
          </Text>
        </Animated.View>

        <View style={styles.cardWrap}>
          <Animated.View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                opacity: cardOpacity,
                transform: [{ translateY: cardTranslateY }],
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
                name={currentCard.icon}
                size={22}
                color={theme.primary}
              />
              <Text style={[styles.pillText, { color: theme.primary }]}>
                Vyaamikk Benefits
              </Text>
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {currentCard.titleEn}
            </Text>
            <Text style={[styles.cardTitleHi, { color: theme.text }]}>
              {currentCard.titleHi}
            </Text>
            <View style={[styles.divider, { backgroundColor: theme.primary }]} />
            <Text style={[styles.cardBody, { color: theme.secondaryText }]}>
              {currentCard.bodyEn}
            </Text>
            <Text style={[styles.cardBodyHi, { color: theme.secondaryText }]}>
              {currentCard.bodyHi}
            </Text>
          </Animated.View>

          <View style={styles.dotsRow}>
            {INTRO_CARDS.map((card, dotIndex) => (
              <View
                key={card.key}
                style={[
                  styles.dot,
                  {
                    width: dotIndex === index ? 24 : 8,
                    backgroundColor:
                      dotIndex === index ? theme.primary : theme.inactiveDot,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.bottomActionWrap}>
          <Text style={[styles.helperText, { color: theme.secondaryText }]}>
            {index === INTRO_CARDS.length - 1
              ? "Continue to your diary"
              : "Tap to continue"}
          </Text>
          <Pressable
            onPress={handleNext}
            hitSlop={14}
            style={({ pressed }) => [
              styles.arrowButton,
              {
                backgroundColor: theme.primary,
                transform: [{ scale: pressed ? 0.96 : 1 }],
                shadowColor: theme.primary,
              },
            ]}
          >
            <Ionicons name="arrow-forward" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

function MainAppPlaceholder({ theme }) {
  return (
    <SafeAreaView style={[styles.mainPlaceholder, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.dashboardCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <MaterialCommunityIcons
          name="view-dashboard-outline"
          size={36}
          color={theme.primary}
        />
        <Text style={[styles.dashboardTitle, { color: theme.text }]}>Dashboard</Text>
        <Text style={[styles.dashboardText, { color: theme.secondaryText }]}>
          Replace with Expo Router: route to /(tabs)/you or restore main:
          expo-router/entry.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function createTheme(isDark) {
  return {
    isDark,
    background: isDark ? "#050505" : "#F8FAFC",
    card: isDark ? "#111827" : "#FFFFFF",
    cardBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.08)",
    text: isDark ? "#FFFFFF" : "#111827",
    secondaryText: isDark ? "#A1A1AA" : "#6B7280",
    primary: "#4F46E5",
    pillBackground: isDark ? "rgba(79,70,229,0.16)" : "rgba(79,70,229,0.10)",
    pillBorder: isDark ? "rgba(129,140,248,0.28)" : "rgba(79,70,229,0.18)",
    skipBackground: isDark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.05)",
    inactiveDot: isDark ? "rgba(255,255,255,0.28)" : "rgba(17,24,39,0.22)",
  };
}

const styles = StyleSheet.create({
  appRoot: { flex: 1 },
  introRoot: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 22 },
  topBar: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skipButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  skipText: { fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },
  brandBlock: { alignItems: "center", marginTop: 12 },
  logoMark: {
    width: 82,
    height: 82,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.26,
    shadowRadius: 28,
    elevation: 10,
  },
  appName: {
    marginTop: 18,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.7,
    textAlign: "center",
  },
  brandLine: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    textAlign: "center",
  },
  cardWrap: { flex: 1, justifyContent: "center", paddingBottom: 26 },
  infoCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 32,
    paddingHorizontal: 22,
    paddingVertical: 26,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 12,
  },
  iconPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 22,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  cardTitleHi: { marginTop: 10, fontSize: 20, lineHeight: 29, fontWeight: "800" },
  divider: { marginTop: 18, marginBottom: 18, width: 58, height: 4, borderRadius: 99 },
  cardBody: { fontSize: 16, lineHeight: 25, fontWeight: "600" },
  cardBodyHi: { marginTop: 12, fontSize: 15, lineHeight: 24, fontWeight: "600" },
  dotsRow: {
    height: 28,
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  dot: { height: 8, borderRadius: 999 },
  bottomActionWrap: { alignItems: "center", paddingBottom: 22 },
  helperText: { marginBottom: 12, fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  arrowButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 10,
  },
  mainPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dashboardCard: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    padding: 26,
    alignItems: "center",
  },
  dashboardTitle: { marginTop: 14, fontSize: 28, fontWeight: "900" },
  dashboardText: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    fontWeight: "600",
  },
});
