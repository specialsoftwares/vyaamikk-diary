import React, { Component, type ErrorInfo, type ReactNode } from "react";

import type { StartupDiagnostics } from "./types";
import { buildDiagnostics } from "./diagnostics";
import { StartupFailureScreen } from "./StartupFailureScreen";
import {
  reportUncaughtRenderError,
  uncaughtRenderDiagnosticInput,
} from "./uncaughtRenderReport";

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

  static getDerivedStateFromError(_error: Error): State {
    return {
      diagnostics: buildDiagnostics(uncaughtRenderDiagnosticInput()),
    };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportUncaughtRenderError(error);
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
