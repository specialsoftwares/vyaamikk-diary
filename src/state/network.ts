import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

export function useIsOnline(): boolean {
  const [online, setOnline] = useState<boolean>(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      // `isInternetReachable` can be null on first emission; treat as online.
      const reachable = s.isInternetReachable === false ? false : s.isConnected !== false;
      setOnline(reachable);
    });
    return () => unsub();
  }, []);
  return online;
}
