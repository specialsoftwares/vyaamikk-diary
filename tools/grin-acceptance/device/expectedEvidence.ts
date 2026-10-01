export const DEVICE_EVIDENCE_SCHEMA_VERSION = 1 as const;

export const PROHIBITED_RELEASE_ACTIONS = [
  "eas-build",
  "play-upload",
  "firebase-deploy",
  "production-fallback",
] as const;

export type DeviceEvidenceStatus = "device_pending" | "play_pending" | "executed";

export type DeviceEvidenceEnvelope = {
  schemaVersion: typeof DEVICE_EVIDENCE_SCHEMA_VERSION;
  matrixIds: string[];
  status: DeviceEvidenceStatus;
  executed: boolean;
  worktreeHead: string;
  contractRevision: string;
  appVersionName: string | null;
  appVersionCode: number | null;
  applicationId: string | null;
  buildChannel: "development-build" | "internal-testing" | "play-installed" | "not_installed";
  deviceModel: string | null;
  androidApi: number | null;
  talkbackVersion: string | null;
  testerRole: "owner-operator" | "independent-qa" | "unassigned";
  startedAtUtc: string | null;
  endedAtUtc: string | null;
  networkSteps: string[];
  issuedNumbersObserved: string[];
  outboxStatesObserved: string[];
  accountUidsHashed: string[];
  crossAccountLeak: "none" | "not_executed" | string;
  logArtefactPaths: string[];
  screenshotPaths: string[];
  blockers: string[];
  prohibitedActionsConfirmedAbsent: readonly string[];
};

export const WAVE1_PENDING_ENVELOPE: DeviceEvidenceEnvelope = {
  schemaVersion: 1,
  matrixIds: ["DEV-01", "DEV-02", "DEV-03", "DEV-04", "DEV-05", "DEV-06", "PLAY-01", "PLAY-02"],
  status: "device_pending",
  executed: false,
  worktreeHead: "unset",
  contractRevision: "2026-10-01.wave1",
  appVersionName: null,
  appVersionCode: null,
  applicationId: null,
  buildChannel: "not_installed",
  deviceModel: null,
  androidApi: null,
  talkbackVersion: null,
  testerRole: "unassigned",
  startedAtUtc: null,
  endedAtUtc: null,
  networkSteps: [],
  issuedNumbersObserved: [],
  outboxStatesObserved: [],
  accountUidsHashed: [],
  crossAccountLeak: "not_executed",
  logArtefactPaths: [],
  screenshotPaths: [],
  blockers: ["native_device_not_authorized_in_wave1", "play_installed_not_authorized_in_wave1"],
  prohibitedActionsConfirmedAbsent: PROHIBITED_RELEASE_ACTIONS,
};
