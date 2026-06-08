import React from "react";
import { StyleSheet, Text, type TextProps } from "react-native";

import { useLanguageTextStyle } from "@/i18n/useLanguageTextStyle";

/** Text for translated UI shell strings — applies Hindi/Devanagari metrics when active. */
export function LocaleUiText({ style, children, ...rest }: TextProps) {
  const langStyle = useLanguageTextStyle(StyleSheet.flatten(style));
  return (
    <Text {...rest} style={[style, langStyle]}>
      {children}
    </Text>
  );
}
