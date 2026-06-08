import React, { useEffect, useState } from "react";
import { InteractionManager } from "react-native";

/**
 * Defers location consent host + expo-location touchpoints until after
 * tab shell interactions complete.
 */
export function DeferredLocationFootprintConsentHost() {
  const [Host, setHost] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      const { LocationFootprintConsentHost } =
        require("@/components/location/LocationFootprintConsentHost") as typeof import("@/components/location/LocationFootprintConsentHost");
      setHost(() => LocationFootprintConsentHost);
    });
    return () => task.cancel();
  }, []);

  if (!Host) return null;
  return <Host />;
}
