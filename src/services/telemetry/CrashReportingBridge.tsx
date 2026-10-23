import React, { useEffect } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "@/state/auth";
import { bindPurposeConsentAccount, reconcilePurposeConsent } from "@/services/consent/purposeConsent";
import { clearUser } from "./crashReporter";

/** Optional reporting stays off until this device's owner receipt is reconciled. */
export function CrashReportingBridge() {
  const { status, user } = useAuth();
  const uid = status === "signed_in" ? user?.uid ?? null : null;
  useEffect(() => {
    bindPurposeConsentAccount(uid);
    clearUser();
    if (!uid) return;
    const reconcile = () => { void reconcilePurposeConsent(uid); };
    reconcile();
    const app = AppState.addEventListener("change", state => { if (state === "active") reconcile(); });
    const network = NetInfo.addEventListener(state => { if (state.isConnected) reconcile(); });
    return () => { app.remove(); network(); bindPurposeConsentAccount(null); };
  }, [uid]);
  return null;
}
