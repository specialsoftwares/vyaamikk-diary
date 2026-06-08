import React, { useEffect, useState } from "react";
import { InteractionManager } from "react-native";

/**
 * Defers loading StatutoryPromptHost (deadline engine + sheet) until after
 * first paint / interactions — keeps statutory modules out of the initial
 * tabs layout graph.
 */
export function DeferredStatutoryPromptHost() {
  const [Host, setHost] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      const { StatutoryPromptHost } =
        require("@/components/statutory/StatutoryPromptHost") as typeof import("@/components/statutory/StatutoryPromptHost");
      setHost(() => StatutoryPromptHost);
    });
    return () => task.cancel();
  }, []);

  if (!Host) return null;
  return <Host />;
}
