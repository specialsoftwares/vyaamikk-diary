import test from "node:test";
import assert from "node:assert/strict";

import { createPhoneOtpController, sanitizeAuthError } from "./grin-live-f-signin-controller.mjs";

function harness(overrides = {}) {
  const statuses = [];
  const state = {
    phone: "+910000000000",
    otp: "123456",
    sendDisabled: false,
    confirmDisabled: true,
    cleared: 0,
    signOuts: 0,
  };
  let resolveSend;
  let rejectSend;
  let sendCalls = 0;
  let confirmCalls = 0;
  let handoffCalls = 0;

  const signInWithPhoneNumber = overrides.signInWithPhoneNumber ||
    (() => {
      sendCalls += 1;
      return new Promise((resolve, reject) => {
        resolveSend = resolve;
        rejectSend = reject;
      });
    });

  const confirmAndGetIdToken =
    overrides.confirmAndGetIdToken ||
    (() => {
      confirmCalls += 1;
      return Promise.resolve("fake-id-token");
    });

  const handoffSession =
    overrides.handoffSession ||
    (() => {
      handoffCalls += 1;
      return Promise.resolve({ ok: true });
    });

  const ctrl = createPhoneOtpController({
    signInWithPhoneNumber,
    confirmAndGetIdToken,
    handoffSession,
    signOut: async () => {
      state.signOuts += 1;
    },
    setStatus: (t) => statuses.push(t),
    getPhone: () => state.phone,
    getOtp: () => state.otp,
    setSendDisabled: (d) => {
      state.sendDisabled = d;
    },
    setConfirmDisabled: (d) => {
      state.confirmDisabled = d;
    },
    clearInputs: () => {
      state.cleared += 1;
      state.phone = "";
      state.otp = "";
    },
  });

  return {
    ctrl,
    statuses,
    state,
    get sendCalls() {
      return sendCalls;
    },
    get confirmCalls() {
      return confirmCalls;
    },
    get handoffCalls() {
      return handoffCalls;
    },
    resolveSend: (v) => resolveSend(v),
    rejectSend: (e) => rejectSend(e),
  };
}

test("sanitizeAuthError returns code only", () => {
  assert.equal(sanitizeAuthError({ code: "auth/too-many-requests", message: "+91…" }), "auth/too-many-requests");
  assert.equal(sanitizeAuthError({}), "error");
});

test("double-click Send produces one injected Auth request", async () => {
  const h = harness();
  const p1 = h.ctrl.send();
  const p2 = h.ctrl.send();
  assert.equal(h.sendCalls, 1);
  assert.equal(h.ctrl.getState().sendInFlight, true);
  assert.match(h.statuses.at(-1), /already in progress/);
  h.resolveSend({ id: "conf-1" });
  const r1 = await p1;
  const r2 = await p2;
  assert.equal(r1.reason, "sent");
  assert.equal(r2.reason, "in_flight");
  assert.equal(h.sendCalls, 1);
  assert.equal(h.ctrl.getState().hasConfirmation, true);
});

test("auth/too-many-requests locks further sends with no retry", async () => {
  const h = harness();
  const p1 = h.ctrl.send();
  h.rejectSend({ code: "auth/too-many-requests", message: "sms quota stuff" });
  const r1 = await p1;
  assert.equal(r1.reason, "throttled");
  assert.equal(h.ctrl.getState().throttled, true);
  assert.equal(h.state.sendDisabled, true);

  const r2 = await h.ctrl.send();
  assert.equal(r2.reason, "throttled");
  assert.equal(h.sendCalls, 1);
  assert.match(h.statuses.at(-1), /no automatic retry/i);
});

test("cancel during pending Send prevents late confirmation install", async () => {
  const h = harness();
  const pending = h.ctrl.send();
  assert.equal(h.sendCalls, 1);
  await h.ctrl.cancel("Cleared.");
  h.resolveSend({ id: "late-conf" });
  const r = await pending;
  assert.equal(r.reason, "cancelled");
  assert.equal(h.ctrl.getState().hasConfirmation, false);
  assert.equal(h.state.confirmDisabled, true);
});

test("cancel during Confirm prevents session handoff", async () => {
  let resolveConfirm;
  const h = harness({
    signInWithPhoneNumber: async () => ({ id: "c1" }),
    confirmAndGetIdToken: () =>
      new Promise((resolve) => {
        resolveConfirm = resolve;
      }),
    handoffSession: async () => {
      throw new Error("handoff must not run after cancel");
    },
  });
  await h.ctrl.send();
  h.state.otp = "999999";
  const pending = h.ctrl.confirm();
  await h.ctrl.cancel("Cleared.");
  resolveConfirm("should-not-handoff");
  const r = await pending;
  assert.equal(r.reason, "cancelled");
  assert.equal(h.ctrl.getState().handedOff, false);
  assert.equal(h.handoffCalls, 0);
});

test("successful confirm hands off once", async () => {
  const h = harness({
    signInWithPhoneNumber: async () => ({ id: "c1" }),
  });
  await h.ctrl.send();
  h.state.otp = "123456";
  const r = await h.ctrl.confirm();
  assert.equal(r.reason, "handed_off");
  assert.equal(h.ctrl.getState().handedOff, true);
  assert.equal(h.handoffCalls, 1);
});
