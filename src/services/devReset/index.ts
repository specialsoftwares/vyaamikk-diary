export {
  DEV_RESET_CONFIRM_PHRASE,
  assertDevResetAllowed,
  assertDevResetAllowedForCli,
  assertFirebaseDevResetAllowed,
  DevResetRefusedError,
  looksLikeProductionFirebaseProject,
  resolveDevBackendLabel,
} from "./guards";

export { resetAllLocalDevData, type DevLocalResetResult } from "./resetLocalAll";
export {
  resetLocalDevDataForTarget,
  resolveTargetProfile,
  type DevResetTarget,
  type DevLocalTargetedResetResult,
} from "./resetLocalTargeted";

export {
  resetAllFirebaseDevData,
  resetFirebaseDevDataForTarget,
  countFirestoreDevUsers,
  type DevFirebaseResetResult,
} from "./firebaseDevReset";

import { getActiveBackend } from "@/config/env";
import { resetAllFirebaseDevData, resetFirebaseDevDataForTarget } from "./firebaseDevReset";
import { resetAllLocalDevData } from "./resetLocalAll";
import { resetLocalDevDataForTarget, type DevResetTarget } from "./resetLocalTargeted";

export interface DevFullResetResult {
  local: Awaited<ReturnType<typeof resetAllLocalDevData>>;
  firebase?: Awaited<ReturnType<typeof resetAllFirebaseDevData>>;
  /** Set when shared-dev Firebase wipe was attempted but failed (local still cleared). */
  firebaseError?: string;
}

/** Full device wipe + optional shared-dev Firestore wipe (local first; Firebase best-effort). */
export async function resetAllDevData(confirmation: string): Promise<DevFullResetResult> {
  const backend = getActiveBackend();
  const local = await resetAllLocalDevData(confirmation);
  let firebase: Awaited<ReturnType<typeof resetAllFirebaseDevData>> | undefined;
  let firebaseError: string | undefined;
  if (backend === "firebase-shared-dev") {
    try {
      firebase = await resetAllFirebaseDevData(confirmation);
    } catch (e) {
      firebaseError = e instanceof Error ? e.message : String(e);
    }
  }
  return { local, firebase, firebaseError };
}

export interface DevTargetedFullResetResult {
  local: Awaited<ReturnType<typeof resetLocalDevDataForTarget>>;
  firebase?: Awaited<ReturnType<typeof resetFirebaseDevDataForTarget>>;
}

export async function resetDevDataForTarget(
  confirmation: string,
  target: DevResetTarget
): Promise<DevTargetedFullResetResult> {
  const local = await resetLocalDevDataForTarget(confirmation, target);
  const backend = getActiveBackend();
  if (backend === "firebase-shared-dev") {
    const firebase = await resetFirebaseDevDataForTarget(confirmation, target);
    return { local, firebase };
  }
  return { local };
}
