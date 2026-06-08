import { useCallback, useRef, type RefObject } from "react";
import { type ScrollView, type View } from "react-native";

import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { scrollFieldIntoView } from "@/utils/keyboard/scrollFieldIntoView";

interface UseKeyboardAwareFieldScrollOptions {
  scrollRef?: RefObject<ScrollView | null>;
  contentRef: RefObject<View | null>;
  enabled?: boolean;
}

/**
 * Scroll-to-field for validation errors only.
 * Focus scroll is intentionally disabled — it blurs TextInput on iOS.
 */
export function useKeyboardAwareFieldScroll({
  scrollRef,
  contentRef,
  enabled = true,
}: UseKeyboardAwareFieldScrollOptions) {
  const keyboardHeight = useKeyboardInset(enabled && Boolean(scrollRef));
  const fieldAnchors = useRef<Record<string, View | null>>({});

  const registerAnchor = useCallback((name: string, ref: View | null) => {
    fieldAnchors.current[name] = ref;
  }, []);

  const scrollToField = useCallback(
    (name: string, options?: { reveal?: boolean }) => {
      if (!enabled || !scrollRef?.current || !options?.reveal) return;
      scrollFieldIntoView(
        {
          scrollRef: scrollRef.current,
          contentRef: contentRef.current,
          anchorRef: fieldAnchors.current[name] ?? null,
          keyboardHeight,
        },
        { reveal: true, animated: true }
      );
    },
    [contentRef, enabled, keyboardHeight, scrollRef]
  );

  const focusHandlersForField = useCallback(
    (_name: string, existingOnFocus?: (e: unknown) => void) => ({
      onFocus: (e: unknown) => {
        existingOnFocus?.(e);
      },
    }),
    []
  );

  return {
    keyboardHeight,
    registerAnchor,
    scrollToField,
    focusHandlersForField,
  };
}
