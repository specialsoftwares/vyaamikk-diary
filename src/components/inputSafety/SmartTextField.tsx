import React, { forwardRef } from "react";
import { type TextInput } from "react-native";

import { KeyboardAwareField } from "@/components/forms/KeyboardAwareField";
import { SmartSuggestionInput } from "@/components/forms/SmartSuggestionInput";
import { TextField, type TextFieldProps } from "@/components/ui/TextField";
import type { MasterFieldKey } from "@/services/masterData";

export interface SmartTextFieldProps extends TextFieldProps {
  /** @deprecated Prefer `navFieldKey`. */
  fieldId?: string;
  fieldKey?: MasterFieldKey;
  keyboardSafe?: boolean;
}

export const SmartTextField = forwardRef<TextInput, SmartTextFieldProps>(function SmartTextField(
  {
    fieldId,
    fieldKey,
    navFieldKey,
    keyboardSafe = true,
    testID,
    ...rest
  },
  ref
) {
  const navKey = navFieldKey ?? fieldId ?? testID;

  const mergedProps: TextFieldProps = {
    ...rest,
    testID,
    navFieldKey: navKey,
  };

  const input =
    fieldKey != null ? (
      <SmartSuggestionInput ref={ref} fieldKey={fieldKey} {...mergedProps} />
    ) : (
      <TextField ref={ref} {...mergedProps} />
    );

  if (!keyboardSafe || !navKey) return input;

  return <KeyboardAwareField fieldId={navKey}>{input}</KeyboardAwareField>;
});
