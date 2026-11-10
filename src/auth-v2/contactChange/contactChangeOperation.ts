import { AppError } from "@/domain/errors";
import { createPhoneAuthOperations, type PhoneAuthWait } from "@/auth-v2/phoneAuthOperation";

export type ContactOwner = { uid: string | null; generation: number; epoch: number };
export type ContactOperation = { id: string; owner: ContactOwner; publicationOpen: boolean };
export type ContactPublication = { owner: ContactOwner; isCurrent: () => boolean };
export const CONTACT_RESULT_UNKNOWN = "We could not confirm the result. You can go back. Check your account before trying again.";

/** UI deadlines retire publication, never a server or Firebase transaction. */
export function createContactChangeOperations(
  readOwner: () => ContactOwner,
  retireNative: () => void,
  now: () => number = Date.now,
  wait?: PhoneAuthWait
) {
  const operations = createPhoneAuthOperations(now, wait);
  let live: ContactOperation | null = null;
  const current = (claim: ContactOperation): boolean => {
    const live = readOwner();
    return operations.sameAttempt(claim.id) && live.uid === claim.owner.uid &&
      live.generation === claim.owner.generation && live.epoch === claim.owner.epoch;
  };
  return {
    begin(): ContactOperation | null {
      const owner = readOwner();
      if (!owner.uid) return null;
      const accepted = operations.accept("account", 20_000);
      if (!accepted.accepted) return null;
      live = { id: accepted.id, owner, publicationOpen: true };
      return live;
    },
    current,
    mayPublish(claim: ContactOperation) { return current(claim) && claim.publicationOpen; },
    async run<T>(claim: ContactOperation, work: () => Promise<T>): Promise<T> {
      if (!current(claim) || !claim.publicationOpen) throw new Error("session_changed");
      const result = await operations.bounded(claim.id, work(), operations.stageBudget(claim.id, 20_000));
      if (!current(claim) || result.status === "cancelled") throw new Error("session_changed");
      if (result.status === "unknown") {
        claim.publicationOpen = false;
        retireNative();
        throw new AppError("network", CONTACT_RESULT_UNKNOWN, undefined, { phoneAuthSettlement: "unknown", mobileChangeRecoveryRequired: true });
      }
      return result.value;
    },
    finish(claim: ContactOperation) {
      claim.publicationOpen = false;
      operations.settle(claim.id, "off");
      if (live?.id === claim.id) live = null;
    },
    retire() {
      const ownsNative = live != null && live.publicationOpen && current(live);
      if (live) live.publicationOpen = false;
      operations.retire(); live = null;
      if (ownsNative) retireNative();
    },
  };
}
