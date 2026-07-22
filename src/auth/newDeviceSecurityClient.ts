/**
 * Client types + local-mock adapter for new-device security.
 *
 * Production Resend / transactional-email provider deploy is EXTERNALLY BLOCKED
 * until secrets, DNS, and Firebase function deploy are completed outside this app.
 * Local-mock can accept/reject for tests only — never treat as production delivery.
 */

export type SecurityEmailProviderState =
  | "accepted"
  | "rejected"
  | "timeout"
  | "unknown"
  | "permanentBounce";

export type NewDeviceSessionStatus =
  | "active"
  | "pendingSecurityNotification"
  | "revoked"
  | "blocked";

export interface NewDeviceSecurityClientEvent {
  eventId: string;
  uid: string;
  sessionId: string;
  deviceInstallationId: string;
  emailState: SecurityEmailProviderState | "pending";
  newSessionStatus: NewDeviceSessionStatus;
  allowRetry: boolean;
}

export interface LocalMockSecurityEmailAdapter {
  mode: "accept" | "reject" | "timeout" | "unknown";
  send(input: { eventId: string; to: string }): Promise<{ state: SecurityEmailProviderState }>;
}

export function createLocalMockSecurityEmailAdapter(
  mode: LocalMockSecurityEmailAdapter["mode"] = "accept"
): LocalMockSecurityEmailAdapter {
  return {
    mode,
    async send() {
      if (mode === "accept") return { state: "accepted" };
      if (mode === "reject") return { state: "rejected" };
      if (mode === "timeout") return { state: "timeout" };
      return { state: "unknown" };
    },
  };
}

/** Apply mock email outcome the same way the server does on failure/success. */
export function applyLocalMockEmailOutcome(
  event: NewDeviceSecurityClientEvent,
  state: SecurityEmailProviderState
): NewDeviceSecurityClientEvent {
  if (state === "accepted") {
    return {
      ...event,
      emailState: state,
      newSessionStatus: "active",
      allowRetry: false,
    };
  }
  return {
    ...event,
    emailState: state,
    newSessionStatus: "blocked",
    allowRetry: state !== "permanentBounce",
  };
}

export const NEW_DEVICE_SECURITY_CALLABLES = {
  register: "registerNewDeviceSecurityEvent",
  retryEmail: "retryNewDeviceSecurityEmail",
  wasNotMe: "handleWasNotMeToken",
} as const;

export const NEW_DEVICE_SECURITY_PRODUCTION_NOTE =
  "Production Resend/provider deploy is EXTERNALLY BLOCKED. Local-mock accept/reject is for tests only.";
