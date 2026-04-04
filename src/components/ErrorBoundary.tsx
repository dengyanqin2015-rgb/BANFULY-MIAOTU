import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-red-500/50 rounded-xl p-8 max-w-2xl w-full shadow-2xl">
            <h1 className="text-2xl font-bold text-red-400 mb-4 flex items-center gap-2">
              <span className="text-3xl">⚠️</span> Application Error
            </h1>
            <p className="text-slate-300 mb-6">
              Something went wrong while rendering the application. Please try refreshing the page.
            </p>
            <div className="bg-slate-950 rounded-lg p-4 font-mono text-sm text-red-300 overflow-auto max-h-64 border border-slate-800">
              {this.state.error?.toString()}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-8 w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-lg transition-colors shadow-lg shadow-red-500/20"
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
