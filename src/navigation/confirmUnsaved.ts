import { Alert } from "react-native";

export interface ConfirmUnsavedOptions {
  t: (key: string) => string;
  onDiscard: () => void;
  /** When true, offer Save draft (composer draft not implemented — omit for now). */
  draftAvailable?: boolean;
  onSaveDraft?: () => void;
}

/** Discard / Continue editing (+ optional Save draft). */
export function confirmUnsavedChanges(options: ConfirmUnsavedOptions): void {
  const { t, onDiscard, draftAvailable, onSaveDraft } = options;
  const buttons: {
    text: string;
    style?: "default" | "cancel" | "destructive";
    onPress?: () => void;
  }[] = [{ text: t("common.continueEditing"), style: "cancel" }];

  if (draftAvailable && onSaveDraft) {
    buttons.unshift({
      text: t("composer.saveDraft"),
      onPress: onSaveDraft,
    });
  }

  buttons.unshift({
    text: t("composer.discardConfirm"),
    style: "destructive",
    onPress: onDiscard,
  });

  Alert.alert(t("composer.discardTitle"), t("composer.discardBody"), buttons);
}
