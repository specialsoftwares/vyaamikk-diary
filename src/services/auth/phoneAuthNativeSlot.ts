/**
 * Decision record for the Android phone-auth slot.
 * The native module in modules/phone-auth-activity is the activity signal.
 * A present module with no current Activity is "missing", never "present".
 * A held slot is released only when that Activity is gone or replaced.
 */

export type ActivityView = { id: string } | null;

export type NativeSlotState = {
  sendGeneration: number;
  sendActivityId: string | null;
  confirmGeneration: number;
  confirmActivityId: string | null;
};

export function activitySignal(activity: ActivityView): string {
  if (!activity?.id) return "missing";
  return `present:${activity.id}`;
}

export function sendPermittedBySignal(signal: string | null | undefined): boolean {
  return typeof signal === "string" && /^present:[1-9][0-9]*$/.test(signal);
}

export function createPhoneAuthNativeSlot() {
  const state: NativeSlotState = {
    sendGeneration: 0,
    sendActivityId: null,
    confirmGeneration: 0,
    confirmActivityId: null,
  };

  function claim(kind: "send" | "confirm", generation: number, activity: ActivityView): string {
    const signal = activitySignal(activity);
    if (!sendPermittedBySignal(signal)) return "refused:missing";
    const activityId = signal.slice("present:".length);
    const heldGeneration = kind === "send" ? state.sendGeneration : state.confirmGeneration;
    const heldActivityId = kind === "send" ? state.sendActivityId : state.confirmActivityId;
    if (heldGeneration !== 0 && heldGeneration !== generation && heldActivityId === activityId) {
      return "refused:in_flight";
    }
    if (kind === "send") {
      state.sendGeneration = generation;
      state.sendActivityId = activityId;
    } else {
      state.confirmGeneration = generation;
      state.confirmActivityId = activityId;
    }
    return `accepted:${activityId}`;
  }

  function release(kind: "send" | "confirm", generation: number): string {
    const heldGeneration = kind === "send" ? state.sendGeneration : state.confirmGeneration;
    if (heldGeneration === 0) return "idle";
    if (heldGeneration !== generation) return "stale";
    if (kind === "send") {
      state.sendGeneration = 0;
      state.sendActivityId = null;
    } else {
      state.confirmGeneration = 0;
      state.confirmActivityId = null;
    }
    return "released";
  }

  function recover(kind: "send" | "confirm", activity: ActivityView): string {
    const heldGeneration = kind === "send" ? state.sendGeneration : state.confirmGeneration;
    const heldActivityId = kind === "send" ? state.sendActivityId : state.confirmActivityId;
    if (heldGeneration === 0) return "idle";
    const signal = activitySignal(activity);
    const currentId = sendPermittedBySignal(signal) ? signal.slice("present:".length) : "";
    if (currentId && heldActivityId === currentId) return "held";
    if (kind === "send") {
      state.sendGeneration = 0;
      state.sendActivityId = null;
    } else {
      state.confirmGeneration = 0;
      state.confirmActivityId = null;
    }
    return "recovered";
  }

  return { state, claim, release, recover };
}
