import { Platform, type TextStyle } from "react-native";

const systemFont = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
}) as string;

const monoFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
}) as string;

export type TypographyToken =
  | "displayLg"
  | "displayMd"
  | "titleLg"
  | "titleMd"
  | "titleSm"
  | "body"
  | "bodyStrong"
  | "caption"
  | "captionStrong"
  | "micro"
  | "mono";

export type TypographyStyles = Record<TypographyToken, TextStyle>;

function buildTypography(localeFont?: string): TypographyStyles {
  const fontFamily = localeFont ?? systemFont;
  const base = (style: TextStyle): TextStyle => ({ fontFamily, ...style });
  return {
    displayLg: base({ fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -0.5 }),
    displayMd: base({ fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.4 }),
    titleLg: base({ fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4 }),
    titleMd: base({ fontSize: 18, lineHeight: 24, fontWeight: "700", letterSpacing: -0.35 }),
    titleSm: base({ fontSize: 16, lineHeight: 22, fontWeight: "700", letterSpacing: -0.3 }),
    body: base({ fontSize: 15, lineHeight: 22, fontWeight: "400" }),
    bodyStrong: base({ fontSize: 15, lineHeight: 22, fontWeight: "600" }),
    caption: base({ fontSize: 13, lineHeight: 18, fontWeight: "400" }),
    captionStrong: base({ fontSize: 13, lineHeight: 18, fontWeight: "600" }),
    micro: base({ fontSize: 11, lineHeight: 14, fontWeight: "500" }),
    mono: {
      fontFamily: monoFont,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "700",
      letterSpacing: 1,
    },
  };
}

let typographyCache = buildTypography();

/** Rebuild typography tokens (new objects) when locale script font changes. */
export function rebuildTypography(localeFont?: string): void {
  typographyCache = buildTypography(localeFont);
}

/** Always reads the latest typography snapshot — never mutate returned objects. */
export const typography: TypographyStyles = new Proxy({} as TypographyStyles, {
  get(_target, prop: string) {
    return typographyCache[prop as TypographyToken];
  },
});
