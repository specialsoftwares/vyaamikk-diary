/**
 * One authoritative local Phone OTP challenge at a time.
 * Late callbacks from retired generations must not mutate UI/session.
 */

export interface PhoneOtpChallengeMachine {
  generation: number;
  sendLocked: boolean;
  verifyLocked: boolean;
  verificationId: string | null;
}

export function createPhoneOtpChallengeMachine(): PhoneOtpChallengeMachine {
  return {
    generation: 0,
    sendLocked: false,
    verifyLocked: false,
    verificationId: null,
  };
}

export function beginPhoneOtpSend(
  machine: PhoneOtpChallengeMachine
): PhoneOtpChallengeMachine | null {
  if (machine.sendLocked) return null;
  return {
    ...machine,
    generation: machine.generation + 1,
    sendLocked: true,
    verifyLocked: false,
    verificationId: null,
  };
}

export function completePhoneOtpSend(
  machine: PhoneOtpChallengeMachine,
  generation: number,
  verificationId: string
): PhoneOtpChallengeMachine | null {
  if (generation !== machine.generation) return null;
  return {
    ...machine,
    sendLocked: false,
    verificationId,
  };
}

export function failPhoneOtpSend(
  machine: PhoneOtpChallengeMachine,
  generation: number
): PhoneOtpChallengeMachine | null {
  if (generation !== machine.generation) return null;
  return {
    ...machine,
    sendLocked: false,
  };
}

export function beginPhoneOtpVerify(
  machine: PhoneOtpChallengeMachine,
  generation: number
): PhoneOtpChallengeMachine | null {
  if (generation !== machine.generation) return null;
  if (machine.verifyLocked) return null;
  return {
    ...machine,
    verifyLocked: true,
  };
}

export function finishPhoneOtpVerify(
  machine: PhoneOtpChallengeMachine,
  generation: number
): PhoneOtpChallengeMachine | null {
  if (generation !== machine.generation) return null;
  return {
    ...machine,
    verifyLocked: false,
  };
}

export function isCurrentPhoneChallenge(
  machine: PhoneOtpChallengeMachine,
  generation: number
): boolean {
  return generation > 0 && generation === machine.generation;
}

export function retirePhoneChallenge(machine: PhoneOtpChallengeMachine): PhoneOtpChallengeMachine {
  return {
    ...machine,
    generation: machine.generation + 1,
    sendLocked: false,
    verifyLocked: false,
    verificationId: null,
  };
}
