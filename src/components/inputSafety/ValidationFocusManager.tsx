import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  Keyboard,
  Platform,
  View,
  type ScrollView,
  type TextInput,
  type View as ViewType,
} from "react-native";

import { useKeyboardFormScroll } from "@/components/forms/KeyboardFormScrollContext";
import { useFormFocus } from "@/components/inputSafety/FormFocusManager";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { scrollFieldIntoView } from "@/utils/keyboard/scrollFieldIntoView";

interface ValidationFocusContextValue {
  registerAnchor: (fieldId: string, anchor: ViewType | null) => void;
  registerInputRef: (fieldId: string, input: TextInput | null) => void;
  scrollToField: (fieldId: string, options?: { reveal?: boolean; focus?: boolean }) => void;
  scrollToFirstInvalid: (
    fieldOrder: string[],
    hasError: (fieldId: string) => boolean,
    options?: { focus?: boolean }
  ) => string | null;
}

const ValidationFocusContext = createContext<ValidationFocusContextValue | null>(null);

export function useValidationFocus(): ValidationFocusContextValue | null {
  return useContext(ValidationFocusContext);
}

interface ValidationFocusProviderProps {
  scrollRef?: RefObject<ScrollView | null>;
  contentRef?: RefObject<ViewType | null>;
  children: React.ReactNode;
}

/** Registers field anchors and scrolls to the first invalid field on submit. */
export function ValidationFocusProvider({
  scrollRef: scrollRefProp,
  contentRef: contentRefProp,
  children,
}: ValidationFocusProviderProps) {
  const formScroll = useKeyboardFormScroll();
  const formFocus = useFormFocus();
  const scrollRef = scrollRefProp ?? formScroll?.scrollRef;
  const contentRef = contentRefProp ?? formScroll?.contentRef;
  const keyboardHeight = useKeyboardInset(Boolean(scrollRef));
  const anchors = useRef<Record<string, ViewType | null>>({});
  const inputs = useRef<Record<string, TextInput | null>>({});

  const scrollToField = useCallback(
    (fieldId: string, options?: { reveal?: boolean; focus?: boolean }) => {
      const anchor = anchors.current[fieldId] ?? null;
      if (scrollRef?.current && contentRef?.current && anchor) {
        scrollFieldIntoView(
          {
            scrollRef: scrollRef.current,
            contentRef: contentRef.current,
            anchorRef: anchor,
            keyboardHeight,
          },
          { reveal: options?.reveal }
        );
      } else if (formScroll && anchor) {
        formScroll.scrollToAnchor(anchor);
      }

      if (options?.focus !== false) {
        const delay = Platform.OS === "ios" ? 120 : 80;
        setTimeout(() => {
          formFocus?.focusField(fieldId);
          inputs.current[fieldId]?.focus();
        }, delay);
      }
    },
    [contentRef, formFocus, formScroll, keyboardHeight, scrollRef]
  );

  const scrollToFirstInvalid = useCallback(
    (
      fieldOrder: string[],
      hasError: (fieldId: string) => boolean,
      options?: { focus?: boolean }
    ) => {
      const first = fieldOrder.find(hasError);
      if (!first) return null;

      const run = () => scrollToField(first, { reveal: true, focus: options?.focus });

      if (keyboardHeight > 0) {
        run();
        return first;
      }

      const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const sub = Keyboard.addListener(showEvent, () => {
        sub.remove();
        run();
      });
      run();
      return first;
    },
    [keyboardHeight, scrollToField]
  );

  const registerAnchor = useCallback((fieldId: string, anchor: ViewType | null) => {
    anchors.current[fieldId] = anchor;
  }, []);

  const registerInputRef = useCallback((fieldId: string, input: TextInput | null) => {
    inputs.current[fieldId] = input;
  }, []);

  const value = useMemo(
    () => ({
      registerAnchor,
      registerInputRef,
      scrollToField,
      scrollToFirstInvalid,
    }),
    [registerAnchor, registerInputRef, scrollToField, scrollToFirstInvalid]
  );

  return (
    <ValidationFocusContext.Provider value={value}>{children}</ValidationFocusContext.Provider>
  );
}

/** Anchor-only wrapper — validation scroll on submit, never on focus. */
export function ValidationFocusField({
  fieldId,
  children,
}: {
  fieldId: string;
  children: React.ReactNode;
}) {
  const validation = useValidationFocus();

  if (!validation) {
    return children;
  }

  return (
    <View
      ref={(node) => {
        validation.registerAnchor(fieldId, node);
      }}
      collapsable={false}
      nativeID={`kbd-field-${fieldId}`}
      pointerEvents="box-none"
    >
      {children}
    </View>
  );
}

/** Standalone helper for forms outside ValidationFocusProvider (composer pattern). */
export function scrollToFirstInvalidField(
  fieldOrder: string[],
  errors: Record<string, unknown>,
  scrollToField: (fieldId: string, options?: { reveal?: boolean }) => void
): string | null {
  const first = fieldOrder.find((id) => Boolean(errors[id]));
  if (!first) return null;
  requestAnimationFrame(() => scrollToField(first, { reveal: true }));
  return first;
}
