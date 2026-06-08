import React from "react";

import { SmartSuggestionInput } from "@/components/forms/SmartSuggestionInput";
import { TextField, type TextFieldProps } from "@/components/ui/TextField";
import { masterKeyForFormField } from "@/services/masterData";
import type { MasterFieldKey } from "@/services/masterData";

export interface ComposerSmartTextFieldProps extends TextFieldProps {
  /** Form field name — resolved to master field key when omitted. */
  name?: string;
  fieldKey?: MasterFieldKey;
}

/**
 * Composer text field with user-scoped master-data suggestions when a field key applies.
 * Registers `name` with FormFocusProvider for return-key navigation.
 */
export function ComposerSmartTextField({
  name,
  fieldKey: fieldKeyProp,
  navFieldKey,
  ...rest
}: ComposerSmartTextFieldProps) {
  const resolvedKey =
    fieldKeyProp ?? (name ? masterKeyForFormField(name) : null);
  const navKey = navFieldKey ?? name;

  if (!resolvedKey) {
    return <TextField navFieldKey={navKey} {...rest} />;
  }

  return <SmartSuggestionInput fieldKey={resolvedKey} navFieldKey={navKey} {...rest} />;
}
