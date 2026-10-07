/**
 * Testable phone-OTP send/confirm controller for GRIN LIVE F local sign-in.
 *
 * Injected Auth only — no real SMS. Guards:
 * - pending Send blocks concurrent submission
 * - auth/too-many-requests locks further sends (no auto-retry)
 * - cancel bumps generation so a late await cannot install confirmation
 *   or hand off a cancelled session
 */

export function sanitizeAuthError(e) {
  const code = e && e.code ? String(e.code) : "error";
  return code;
}

/**
 * @param {object} deps
 * @param {(phone: string) => Promise<unknown>} deps.signInWithPhoneNumber
 * @param {(confirmation: unknown, code: string) => Promise<string>} deps.confirmAndGetIdToken
 *   resolves to idToken string only (never log it in callers)
 * @param {(idToken: string) => Promise<{ ok: boolean }>} deps.handoffSession
 * @param {() => Promise<void>} [deps.signOut]
 * @param {(t: string) => void} deps.setStatus
 * @param {() => string} deps.getPhone
 * @param {() => string} deps.getOtp
 * @param {(disabled: boolean) => void} deps.setSendDisabled
 * @param {(disabled: boolean) => void} deps.setConfirmDisabled
 * @param {() => void} deps.clearInputs
 */
export function createPhoneOtpController(deps) {
  let confirmation = null;
  let sendInFlight = false;
  let confirmInFlight = false;
  let throttled = false;
  let sendGeneration = 0;
  let confirmGeneration = 0;
  let handedOff = false;

  function getState() {
    return {
      sendInFlight,
      confirmInFlight,
      throttled,
      hasConfirmation: confirmation != null,
      sendGeneration,
      confirmGeneration,
      handedOff,
    };
  }

  async function cancel(reason) {
    sendGeneration += 1;
    confirmGeneration += 1;
    confirmation = null;
    sendInFlight = false;
    confirmInFlight = false;
    deps.clearInputs();
    deps.setConfirmDisabled(true);
    deps.setSendDisabled(throttled);
    try {
      if (deps.signOut) await deps.signOut();
    } catch (_) {
      /* ignore */
    }
    if (reason) deps.setStatus(reason);
  }

  async function send() {
    if (sendInFlight || throttled) {
      deps.setStatus(
        throttled
          ? "Send blocked: auth/too-many-requests (no automatic retry)."
          : "Send already in progress.",
      );
      return { started: false, reason: throttled ? "throttled" : "in_flight" };
    }
    sendInFlight = true;
    deps.setSendDisabled(true);
    const gen = sendGeneration;
    try {
      const phone = deps.getPhone().trim();
      if (!phone.startsWith("+")) {
        deps.setStatus("Use E.164 phone (leading +).");
        return { started: true, reason: "bad_phone" };
      }
      deps.setStatus("Sending OTP…");
      const conf = await deps.signInWithPhoneNumber(phone);
      if (gen !== sendGeneration) {
        return { started: true, reason: "cancelled" };
      }
      confirmation = conf;
      deps.setConfirmDisabled(false);
      deps.setStatus("OTP sent. Enter the code below.");
      return { started: true, reason: "sent" };
    } catch (e) {
      if (gen !== sendGeneration) {
        return { started: true, reason: "cancelled" };
      }
      const code = sanitizeAuthError(e);
      if (code === "auth/too-many-requests") {
        throttled = true;
        deps.setSendDisabled(true);
        deps.setStatus(
          "Send failed: auth/too-many-requests. No automatic retry. Do not click Send again until Auth rate limits clear.",
        );
        return { started: true, reason: "throttled" };
      }
      deps.setStatus(
        "Send failed: " +
          code +
          ". If domain/provider config is required, stop and report that exact change; do not expand IAM.",
      );
      deps.setSendDisabled(false);
      return { started: true, reason: code };
    } finally {
      if (gen === sendGeneration) {
        sendInFlight = false;
        if (!throttled && !confirmation) deps.setSendDisabled(false);
      }
    }
  }

  async function confirm() {
    if (confirmInFlight) {
      deps.setStatus("Confirm already in progress.");
      return { started: false, reason: "in_flight" };
    }
    confirmInFlight = true;
    deps.setConfirmDisabled(true);
    const gen = confirmGeneration;
    try {
      const code = deps.getOtp().trim();
      if (!confirmation) {
        deps.setStatus("Send OTP first.");
        return { started: true, reason: "no_confirmation" };
      }
      deps.setStatus("Confirming…");
      const idToken = await deps.confirmAndGetIdToken(confirmation, code);
      if (gen !== confirmGeneration) {
        return { started: true, reason: "cancelled" };
      }
      const body = await deps.handoffSession(idToken);
      if (gen !== confirmGeneration) {
        return { started: true, reason: "cancelled" };
      }
      confirmation = null;
      deps.clearInputs();
      deps.setConfirmDisabled(true);
      deps.setSendDisabled(throttled);
      try {
        if (deps.signOut) await deps.signOut();
      } catch (_) {
        /* ignore */
      }
      if (!body || !body.ok) {
        deps.setStatus(
          "Session rejected by local harness. Tokens were not printed or stored.",
        );
        return { started: true, reason: "rejected" };
      }
      handedOff = true;
      deps.setStatus(
        "Signed in and handed off. Local Auth cleared. You can close this tab; the harness continues.",
      );
      return { started: true, reason: "handed_off" };
    } catch (e) {
      if (gen !== confirmGeneration) {
        return { started: true, reason: "cancelled" };
      }
      const code = sanitizeAuthError(e);
      await cancel("Confirm failed: " + code);
      return { started: true, reason: code };
    } finally {
      if (gen === confirmGeneration) {
        confirmInFlight = false;
      }
    }
  }

  return { send, confirm, cancel, getState };
}
