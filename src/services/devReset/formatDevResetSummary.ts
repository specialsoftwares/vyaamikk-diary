import type { DevFullResetResult } from "@/services/devReset";

/** Human-readable dev reset outcome for in-app alerts. */
export function formatDevFullResetSummary(result: DevFullResetResult): {
  title: string;
  message: string;
  tone: "ok" | "partial";
} {
  const localLine = `Device cleared: ${result.local.usersPurged} local identity slot(s), ${result.local.asyncKeysRemoved} storage keys.`;

  if (result.firebase) {
    const warn =
      result.firebase.warnings.length > 0
        ? `\n\nWarnings: ${result.firebase.warnings.slice(0, 3).join("; ")}`
        : "";
    return {
      title: "Reset complete",
      tone: "ok",
      message: `${localLine}\n\nFirestore cleared: ${result.firebase.usersDeleted} user(s) deleted from ${result.firebase.projectId}.${warn}\n\nYou can register fresh with a new or reused test mobile.`,
    };
  }

  if (result.firebaseError) {
    return {
      title: "Device cleared — Firestore unchanged",
      tone: "partial",
      message: `${localLine}\n\nFirestore wipe failed:\n${result.firebaseError}\n\nYour phone is clean, but cloud identity may still exist. Use a new test mobile/email, run npm run dev:reset-firebase on your Mac, or delete users in Firebase Console before re-testing login.`,
    };
  }

  return {
    title: "Local reset complete",
    tone: "ok",
    message: `${localLine}\n\n(local-mock mode — no Firestore project active.)`,
  };
}
