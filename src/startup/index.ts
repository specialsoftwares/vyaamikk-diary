export type {
  StartupStage,
  StartupErrorCode,
  StartupDiagnostics,
  StartupOutcome,
  FirebaseVarPresence,
} from "./types";
export { StartupError, redactStartupMessage } from "./errors";
export { runStartupCoordinator } from "./coordinator";
export { evaluateProductionConfig, assertProductionConfig } from "./guards";
export { BootstrapRoot } from "./BootstrapRoot";
export { StartupFailureScreen } from "./StartupFailureScreen";
export { clearLocalBetaData } from "./clearLocalBetaData";
export { formatDiagnosticsPlainText, readFirebaseVarPresence } from "./diagnostics";
