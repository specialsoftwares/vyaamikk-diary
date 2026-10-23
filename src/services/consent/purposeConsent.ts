/** Purpose choices use the existing local gate plus an owner-scoped durable receipt outbox. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CRASH_DIAGNOSTICS_PURPOSE, REQUIRED_PROCESSING_PURPOSE, consentAppliesToAccount, withdrawalEffect } from "@/domain/processingPurpose";
import { currentAuthMutationGeneration } from "@/services/auth/authSessionFence";
import { applyDiagnosticsChoice, currentDiagnosticsPreference, type DiagnosticsPreference } from "@/services/telemetry/diagnosticsPreference";
import { createPurposeConsentQueue, type PurposeQueueState } from "./purposeConsentQueue";
export { PROCESSING_NOTICE_VERSION, PROCESSING_POLICY_VERSION } from "./purposeConsentQueue";

const key = (uid: string) => `vyd_purpose_receipt_v1:${uid}`;
const queue = createPurposeConsentQueue({
  async load(uid) {
    const raw = await AsyncStorage.getItem(key(uid));
    if (!raw) return null;
    const state = JSON.parse(raw) as PurposeQueueState;
    if (state.uid !== uid || !Number.isSafeInteger(state.revision) || state.revision < 0 || typeof state.localGrant !== "boolean") throw new Error("invalid_purpose_state");
    return state;
  },
  save: (state) => AsyncStorage.setItem(key(state.uid), JSON.stringify(state)),
  async send(input) {
    const { callRecordProcessingPurpose } = await import("@/services/auth/identityCallable");
    return callRecordProcessingPurpose(input);
  },
  generation: currentAuthMutationGeneration,
  observeRemote(uid, onRemote) {
    let unsubscribe = () => {};
    let cancelled = false;
    void (async () => {
      try {
        const { getFirebaseDb } = await import("@/config/firebase");
        const { doc, onSnapshot } = await import("firebase/firestore");
        if (cancelled) return;
        const ref = doc(getFirebaseDb(), "users", uid, "processingPurposes", "crash_diagnostics");
        unsubscribe = onSnapshot(
          ref,
          (snap) => {
            const data = snap.data();
            if (data?.decision !== "withdraw") return;
            onRemote({
              ok: true,
              revision: Number(data.revision) || 0,
              decision: "withdraw",
              receivedAt: typeof data.receivedAt === "number" ? data.receivedAt : null,
            });
          },
          () => undefined
        );
      } catch {
        // Foreground and network reconciliation remains if the listener cannot start.
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  },
  applyLocal: applyDiagnosticsChoice,
  // Idempotency identifier, not a credential or cryptographic key.
  operationId: () => `purpose_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`,
});
export const bindPurposeConsentAccount = queue.bind;
export const currentPurposeConsentState = queue.state;
export const subscribePurposeConsent = queue.subscribe;
export async function reconcilePurposeConsent(uid: string): Promise<void> {
  try { await queue.reconcile(uid); } catch { await applyDiagnosticsChoice(false); }
}
export async function chooseCrashDiagnostics(enabled: boolean, uid: string): Promise<DiagnosticsPreference> {
  try { await queue.choose(uid, enabled); } catch { await applyDiagnosticsChoice(false); }
  return currentDiagnosticsPreference();
}
export async function withdrawProcessingPurpose(purpose: string, uid: string): Promise<{ stopsPurposeProcessing: boolean; deletesAccount: boolean }> {
  const effect = withdrawalEffect(purpose);
  if (purpose === CRASH_DIAGNOSTICS_PURPOSE) await chooseCrashDiagnostics(false, uid);
  return effect;
}
export function requiredProcessingIsNotOptional(): boolean {
  return withdrawalEffect(REQUIRED_PROCESSING_PURPOSE).stopsPurposeProcessing === false;
}
export { consentAppliesToAccount };
