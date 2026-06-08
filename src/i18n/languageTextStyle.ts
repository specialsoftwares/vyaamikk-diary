import { type TextStyle } from "react-native";

import type { Lang } from "./types";

const HI_LINE_HEIGHT_RATIO = 1.45;

function readFontSize(style?: TextStyle | TextStyle[]): number | undefined {
  if (!style) return undefined;
  const flat = (Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : style) as TextStyle;
  return typeof flat.fontSize === "number" ? flat.fontSize : undefined;
}

/**
 * Supplemental TextStyle for translated UI shell text.
 * Hindi/Devanagari needs taller lineHeight — never apply to user data or numbers.
 */
export function getLanguageTextStyle(
  language: Lang,
  baseStyle?: TextStyle | TextStyle[]
): TextStyle {
  if (language !== "hi") return {};
  const fontSize = readFontSize(baseStyle) ?? 15;
  return {
    lineHeight: Math.round(fontSize * HI_LINE_HEIGHT_RATIO),
    letterSpacing: 0,
    paddingVertical: 1,
  };
}
