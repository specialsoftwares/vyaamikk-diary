import React, { useContext } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";

import { resolveYouTabIconConcept } from "@/components/you/YouTabIcon";
import { useTabBarMetrics } from "@/layout/tabBar";
import { selectedTabRouteName } from "@/navigation/tabRouteSelection";
import { typography, useTheme } from "@/theme";

const YOU_TAB_ICON_NAME = {
  notebook: "book-open-page-variant-outline",
  ledger: "file-document-multiple-outline",
  command: "view-dashboard-outline",
} as const satisfies Record<
  ReturnType<typeof resolveYouTabIconConcept>,
  keyof typeof MaterialCommunityIcons.glyphMap
>;

const ICONS = {
  calendar: "calendar-month-outline",
  you: YOU_TAB_ICON_NAME[resolveYouTabIconConcept()],
  "saved-records": "archive-outline",
  settings: "tune-variant",
} as const;

/**
 * Highlight follows `state.index`. Hardware Back is the tab router's
 * `backBehavior="history"` so it pops history instead of navigating again.
 */
export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const metrics = useTabBarMetrics();
  const selected = selectedTabRouteName(state);
  const reportTabBarHeight = useContext(BottomTabBarHeightCallbackContext);

  return (
    <View
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        if (height > 0) reportTabBarHeight?.(height);
      }}
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          paddingBottom: metrics.paddingBottom,
          borderTopColor: colors.divider,
          minHeight: metrics.height,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = route.name === selected && index === state.index;
        const options = descriptors[route.key]?.options;
        const label = options?.title ?? route.name;
        const iconName = ICONS[route.name as keyof typeof ICONS] ?? "circle-outline";
        const color = focused ? colors.primary : colors.textMuted;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={typeof label === "string" ? label : route.name}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            style={styles.item}
          >
            <View
              style={[
                styles.iconWrap,
                focused ? { backgroundColor: colors.primaryLight } : null,
              ]}
            >
              <MaterialCommunityIcons name={iconName} size={22} color={color} />
            </View>
            <Text
              style={[styles.label, { color }, focused ? styles.labelSelected : null]}
              numberOfLines={2}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
    minWidth: 0,
  },
  iconWrap: {
    width: 48,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.micro,
    textAlign: "center",
    flexShrink: 1,
  },
  labelSelected: {
    fontWeight: "700",
  },
});
