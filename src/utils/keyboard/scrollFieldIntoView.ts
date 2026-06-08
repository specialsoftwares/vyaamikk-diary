import { Dimensions, Platform, type ScrollView, type View } from "react-native";

const DEFAULT_VISIBLE_GAP = 88;

export interface ScrollFieldIntoViewOptions {
  finalPass?: boolean;
  /** When true, scroll field into view (validation errors). Focus must never scroll. */
  reveal?: boolean;
  animated?: boolean;
}

/**
 * Scrolls a form anchor above the keyboard — validation / error reveal only.
 */
export function scrollFieldIntoView(
  input: {
    scrollRef: ScrollView | null;
    contentRef: View | null;
    anchorRef: View | null;
    keyboardHeight: number;
    visibleGap?: number;
  },
  options?: ScrollFieldIntoViewOptions
): void {
  const { scrollRef, contentRef, anchorRef, keyboardHeight, visibleGap = DEFAULT_VISIBLE_GAP } =
    input;
  if (!scrollRef || !contentRef || !anchorRef || !options?.reveal) return;

  const animated = options.animated ?? true;

  anchorRef.measureLayout(
    contentRef,
    (_x, layoutY, _w, _layoutH) => {
      const runScroll = (extraY: number) => {
        scrollRef.scrollTo({
          y: Math.max(0, layoutY - visibleGap + extraY),
          animated,
        });
      };

      if (keyboardHeight <= 0) {
        runScroll(0);
        return;
      }

      anchorRef.measureInWindow((_ax, windowY, _aw, windowH) => {
        const windowHeight = Dimensions.get("window").height;
        const visibleBottom = windowHeight - keyboardHeight - visibleGap;
        const fieldBottom = windowY + windowH;
        const overlap = fieldBottom - visibleBottom;
        runScroll(overlap > 0 ? overlap : 0);
      });
    },
    () => {
      // measureLayout failed — skip.
    }
  );

  if (keyboardHeight > 0 && !options.finalPass) {
    const delay = Platform.OS === "ios" ? 280 : 120;
    setTimeout(() => {
      scrollFieldIntoView(input, { ...options, finalPass: true });
    }, delay);
  }
}

export { shouldScrollFieldOnFocus } from "./scrollFieldFocusPolicy";
