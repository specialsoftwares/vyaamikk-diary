import React, { Component, type ErrorInfo, type ReactNode } from "react";

import type { StartupDiagnostics } from "./types";
import { buildDiagnostics } from "./diagnostics";
import { StartupFailureScreen } from "./StartupFailureScreen";

interface Props {
  children: ReactNode;
  onRetry: () => void;
}

interface State {
  diagnostics: StartupDiagnostics | null;
}

/**
 * Catches render/lifecycle errors in the provider tree and shows the
 * controlled Startup Failure screen instead of a blank/dead process.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { diagnostics: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      diagnostics: buildDiagnostics({
        failedStage: "ROUTER_READY",
        errorCode: "UNCAUGHT_JS_ERROR",
        message: error?.message || "Render error",
        checkpoints: ["BOOT", "ROUTER_READY"],
      }),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep console evidence for release debugging without showing secrets.
    console.error("[RootErrorBoundary]", error?.message, info?.componentStack);
  }

  private retry = (): void => {
    this.setState({ diagnostics: null });
    this.props.onRetry();
  };

  render(): ReactNode {
    if (this.state.diagnostics) {
      return (
        <StartupFailureScreen
          diagnostics={this.state.diagnostics}
          onRetry={this.retry}
        />
      );
    }
    return this.props.children;
  }
}
