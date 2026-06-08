import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Keyboard, type TextInput, type TextInputProps } from "react-native";

import { isMultilineFieldKey } from "@/utils/formFieldNavigation/fieldNavOrders";

export interface FormFieldNavMeta {
  multiline?: boolean;
  /** When false, skipped in next-field chain (pickers, read-only). */
  navigable?: boolean;
}

interface FormFocusContextValue {
  setFieldOrder: (order: string[]) => void;
  registerField: (fieldKey: string, ref: TextInput | null, meta?: FormFieldNavMeta) => void;
  focusField: (fieldKey: string) => void;
  focusNext: (fieldKey: string) => boolean;
  getNavigationProps: (
    fieldKey: string,
    meta?: FormFieldNavMeta
  ) => Pick<TextInputProps, "returnKeyType" | "blurOnSubmit" | "onSubmitEditing">;
}

const FormFocusContext = createContext<FormFocusContextValue | null>(null);

export function useFormFocus(): FormFocusContextValue | null {
  return useContext(FormFocusContext);
}

interface StoredField {
  ref: TextInput | null;
  multiline: boolean;
  navigable: boolean;
}

export function FormFocusProvider({ children }: { children: React.ReactNode }) {
  const fieldsRef = useRef<Record<string, StoredField>>({});
  const fieldOrderRef = useRef<string[]>([]);

  const setFieldOrder = useCallback((order: string[]) => {
    fieldOrderRef.current = order;
  }, []);

  const registerField = useCallback(
    (fieldKey: string, ref: TextInput | null, meta?: FormFieldNavMeta) => {
      const prev = fieldsRef.current[fieldKey];
      fieldsRef.current[fieldKey] = {
        ref,
        multiline: meta?.multiline ?? prev?.multiline ?? isMultilineFieldKey(fieldKey),
        navigable: meta?.navigable ?? prev?.navigable ?? true,
      };
    },
    []
  );

  const focusField = useCallback((fieldKey: string) => {
    fieldsRef.current[fieldKey]?.ref?.focus();
  }, []);

  const getNextKey = useCallback((currentKey: string): string | null => {
    const order = fieldOrderRef.current;
    const idx = order.indexOf(currentKey);
    if (idx < 0) return null;
    for (let i = idx + 1; i < order.length; i++) {
      const key = order[i];
      const meta = fieldsRef.current[key];
      if (meta?.navigable === false) continue;
      return key;
    }
    return null;
  }, []);

  const focusNext = useCallback(
    (fieldKey: string) => {
      let current = fieldKey;
      while (true) {
        const next = getNextKey(current);
        if (!next) {
          Keyboard.dismiss();
          return false;
        }
        const stored = fieldsRef.current[next];
        if (stored?.ref && stored.navigable !== false) {
          stored.ref.focus();
          return true;
        }
        current = next;
      }
    },
    [getNextKey]
  );

  const getNavigationProps = useCallback(
    (
      fieldKey: string,
      meta?: FormFieldNavMeta
    ): Pick<TextInputProps, "returnKeyType" | "blurOnSubmit" | "onSubmitEditing"> => {
      const stored = fieldsRef.current[fieldKey];
      const multiline =
        meta?.multiline ?? stored?.multiline ?? isMultilineFieldKey(fieldKey);
      const navigable = meta?.navigable ?? stored?.navigable ?? true;

      if (!navigable || multiline) {
        return {
          blurOnSubmit: false,
          returnKeyType: multiline ? "default" : "done",
        };
      }

      const next = getNextKey(fieldKey);
      return {
        blurOnSubmit: false,
        returnKeyType: next ? "next" : "done",
        onSubmitEditing: () => {
          focusNext(fieldKey);
        },
      };
    },
    [focusNext, getNextKey]
  );

  const value = useMemo(
    () => ({
      setFieldOrder,
      registerField,
      focusField,
      focusNext,
      getNavigationProps,
    }),
    [setFieldOrder, registerField, focusField, focusNext, getNavigationProps]
  );

  return <FormFocusContext.Provider value={value}>{children}</FormFocusContext.Provider>;
}

/** Register ordered fields; returns `bind(fieldKey)` props for TextField / SmartTextField. */
export function useFormFieldNavigation(
  fieldOrder: string[],
  options?: { enabled?: boolean }
) {
  const focus = useFormFocus();
  const enabled = options?.enabled !== false && Boolean(focus);

  useEffect(() => {
    if (enabled && focus) {
      focus.setFieldOrder(fieldOrder);
    }
  }, [fieldOrder, enabled, focus]);

  const bind = useCallback(
    (
      fieldKey: string,
      meta?: FormFieldNavMeta
    ): Pick<TextInputProps, "returnKeyType" | "blurOnSubmit" | "onSubmitEditing"> & {
      ref: (node: TextInput | null) => void;
    } => {
      if (!enabled || !focus) {
        return { ref: () => {} };
      }

      return {
        ref: (node: TextInput | null) => {
          focus.registerField(fieldKey, node, meta);
        },
        ...focus.getNavigationProps(fieldKey, meta),
      };
    },
    [enabled, focus]
  );

  return {
    bind,
    focusField: focus?.focusField,
    focusNext: focus?.focusNext,
    enabled,
  };
}

/** Apply navigation bind props with explicit keyboard overrides (auth CTAs, etc.). */
export function withFieldNavigation(
  bind: ReturnType<typeof useFormFieldNavigation>["bind"],
  fieldKey: string,
  meta: FormFieldNavMeta | undefined,
  overrides: Partial<TextInputProps> = {}
) {
  const base = bind(fieldKey, meta);
  return {
    ...base,
    returnKeyType: overrides.returnKeyType ?? base.returnKeyType,
    blurOnSubmit: overrides.blurOnSubmit ?? base.blurOnSubmit,
    onSubmitEditing: overrides.onSubmitEditing ?? base.onSubmitEditing,
  };
}
