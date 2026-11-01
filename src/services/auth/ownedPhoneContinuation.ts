import { AppError } from "../../domain/errors";

/** All delayed UI acknowledgements retain the authority of their initiating session. */
export async function continueOwnedPhoneNavigation(input: {
  destination: "email" | "profile" | "dashboard";
  isCurrent(): boolean;
  markEmail(): Promise<void>;
  prepare(): void;
  acknowledge(callback: () => void): void;
  publish(): void;
  clearChallenge(): Promise<void>;
  challengeCleared(): void;
  loadClearDigits(): Promise<() => Promise<void>>;
  onError(error: unknown): void;
}): Promise<void> {
  const assertCurrent = () => {
    if (!input.isCurrent()) throw new AppError("permission_denied", "session_changed");
  };
  assertCurrent();
  await input.markEmail();
  assertCurrent();
  input.prepare();
  assertCurrent();
  input.acknowledge(() => {
    void (async () => {
      assertCurrent();
      // Email/profile navigation must precede challenge removal, avoiding the
      // OTP-without-challenge render and retaining the early email transition.
      if (input.destination !== "dashboard") input.publish();
      assertCurrent();
      await input.clearChallenge();
      assertCurrent();
      input.challengeCleared();
      if (input.destination === "dashboard") input.publish();
      if (input.destination === "email") {
        assertCurrent();
        const clearDigits = await input.loadClearDigits();
        assertCurrent();
        await clearDigits();
        assertCurrent();
      }
    })().catch((error) => {
      // A retired attempt must not overwrite the next session's error panel.
      if (input.isCurrent()) input.onError(error);
    });
  });
}
