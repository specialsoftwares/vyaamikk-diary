import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { View, type ScrollView, type View as ViewType } from "react-native";

import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { scrollFieldIntoView } from "@/utils/keyboard/scrollFieldIntoView";

interface KeyboardFormScrollContextValue {
  scrollRef: RefObject<ScrollView | null>;
  contentRef: RefObject<ViewType | null>;
  keyboardHeight: number;
  scrollToAnchor: (anchor: ViewType | null) => void;
}

const KeyboardFormScrollContext = createContext<KeyboardFormScrollContextValue | null>(
  null
);

export function useKeyboardFormScroll(): KeyboardFormScrollContextValue | null {
  return useContext(KeyboardFormScrollContext);
}

interface KeyboardFormScrollProviderProps {
  scrollRef: RefObject<ScrollView | null>;
  enabled?: boolean;
  children: React.ReactNode;
}

export function KeyboardFormScrollProvider({
  scrollRef,
  enabled = true,
  children,
}: KeyboardFormScrollProviderProps) {
  const contentRef = useRef<ViewType>(null);
  const keyboardHeight = useKeyboardInset(enabled);

  const scrollToAnchor = useCallback(
    (anchor: ViewType | null) => {
      if (!enabled || !scrollRef.current || !anchor) return;
      scrollFieldIntoView(
        {
          scrollRef: scrollRef.current,
          contentRef: contentRef.current,
          anchorRef: anchor,
          keyboardHeight,
        },
        { reveal: true, animated: true }
      );
    },
    [enabled, keyboardHeight, scrollRef]
  );

  const value = useMemo(
    () => ({
      scrollRef,
      contentRef,
      keyboardHeight,
      scrollToAnchor,
    }),
    [scrollRef, keyboardHeight, scrollToAnchor]
  );

  return (
    <KeyboardFormScrollContext.Provider value={value}>
      <View ref={contentRef} collapsable={false} pointerEvents="box-none">
        {children}
      </View>
    </KeyboardFormScrollContext.Provider>
  );
}
