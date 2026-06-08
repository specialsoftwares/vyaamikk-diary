import React from "react";
import { StyleSheet, Text } from "react-native";

import { typography, useThemedStyles } from "@/theme";

interface LastRefreshedHintProps {
  message: string | null;
}

/** Subtle pull-to-refresh status line — no modal, no blocking loader. */
export function LastRefreshedHint({ message }: LastRefreshedHintProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      text: {
        ...typography.micro,
        color: c.textSubtle,
        textAlign: "center",
        marginTop: 4,
        marginBottom: 2,
      },
    })
  );

  if (!message) return null;
  return <Text style={styles.text}>{message}</Text>;
}
