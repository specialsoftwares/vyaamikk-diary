import React, { useRef } from "react";
import { View, type View as ViewType } from "react-native";

import { useValidationFocus } from "@/components/inputSafety/ValidationFocusManager";

/**
 * Registers a field anchor for validation scroll only.
 * Does not wrap or clone the input — avoids breaking TextInput focus on iOS.
 */
export function KeyboardAwareField({
  fieldId,
  children,
}: {
  fieldId: string;
  children: React.ReactNode;
}) {
  const validation = useValidationFocus();
  const anchorRef = useRef<ViewType | null>(null);

  if (!validation) {
    return children;
  }

  return (
    <View
      ref={(node) => {
        anchorRef.current = node;
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
