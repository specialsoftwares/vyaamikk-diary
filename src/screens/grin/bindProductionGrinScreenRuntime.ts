import { StyleSheet as RnStyleSheet, View as RnView, Text as RnText, FlatList as RnFlatList, Platform as RnPlatform, AppState } from "react-native";
import { useSafeAreaInsets as useRnSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFocusEffect as useRnFocusEffect,
  useLocalSearchParams as useRnLocalSearchParams,
  useRouter as useRnRouter,
} from "expo-router";

import {
  Banner,
  Button,
  Card,
  EmptyState,
  FormSection,
  Header,
  IndigoChoiceChip,
  IndigoChoiceChipRow,
  Screen,
  SelectField,
  TextField,
} from "@/components/ui";
import { useT } from "@/i18n";
import { useThemedStyles } from "@/theme";

import { installGrinScreenRuntime } from "./grinScreenHooks";
import { installGrinSurfaces } from "./grinSurfaces";

let bound = false;

export function bindProductionGrinScreenRuntime(): void {
  if (bound) return;
  installGrinSurfaces({
    Screen,
    Header,
    Banner,
    Button,
    FormSection,
    TextField,
    SelectField,
    Card,
    EmptyState,
    View: RnView,
    Text: RnText,
    FlatList: RnFlatList,
    IndigoChoiceChip,
    IndigoChoiceChipRow,
    StyleSheet: RnStyleSheet,
    Platform: { OS: RnPlatform.OS },
    useSafeAreaInsets: useRnSafeAreaInsets,
  });
  installGrinScreenRuntime({
    useT,
    useThemedStyles,
    useRouter: useRnRouter,
    useLocalSearchParams: useRnLocalSearchParams as GrinScreenRuntimeParams,
    useFocusEffect: (effect) => {
      useRnFocusEffect(() => {
        const cleanup = effect();
        return typeof cleanup === "function" ? cleanup : undefined;
      });
    },
    getPickerHostAppState: () => AppState.currentState,
  });
  bound = true;
}

type GrinScreenRuntimeParams = <T extends Record<string, string | undefined>>() => T;
