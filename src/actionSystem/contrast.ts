/**
 * Lightweight contrast helpers for Action System contracts.
 * Not a WCAG certification suite — regression guards only.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Parse `#RGB`, `#RRGGBB`, or `rgba(r,g,b,a)` / `rgb(r,g,b)`. */
export function parseCssColor(input: string): Rgba | null {
  const raw = input.trim();
  if (raw.startsWith("#")) {
    const hex = raw.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      if ([r, g, b].some((v) => Number.isNaN(v))) return null;
      return { r, g, b, a: 1 };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].some((v) => Number.isNaN(v))) return null;
      return { r, g, b, a: 1 };
    }
    return null;
  }

  const rgba = raw.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (!rgba) return null;
  const r = Number(rgba[1]);
  const g = Number(rgba[2]);
  const b = Number(rgba[3]);
  const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
  if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
  return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a };
}

/**
 * Composite a (possibly translucent) foreground over an opaque background.
 * Used so rgba(165,180,252,0.12) fills can be compared against card surfaces.
 */
export function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  const inv = 1 - a;
  return {
    r: clampByte(fg.r * a + bg.r * inv),
    g: clampByte(fg.g * a + bg.g * inv),
    b: clampByte(fg.b * a + bg.b * inv),
    a: 1,
  };
}

function channelLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance (sRGB), opaque color. */
export function relativeLuminance(color: Rgba): number {
  const opaque = color.a >= 1 ? color : { ...color, a: 1 };
  return (
    0.2126 * channelLinear(opaque.r) +
    0.7152 * channelLinear(opaque.g) +
    0.0722 * channelLinear(opaque.b)
  );
}

/** Contrast ratio of two opaque colors (higher is more contrast). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastRatioCss(foreground: string, background: string): number | null {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return null;
  const solidFg = fg.a < 1 ? compositeOver(fg, bg) : fg;
  const solidBg = bg.a < 1 ? { ...bg, a: 1 } : bg;
  return contrastRatio(solidFg, solidBg);
}
