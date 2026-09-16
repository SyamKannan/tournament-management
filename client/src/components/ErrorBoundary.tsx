import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Changing this (e.g. the pathname) clears a caught error, so navigating away recovers. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps one broken screen from blanking the whole app: the navbar stays up and
 * the visitor gets a way back instead of a white page.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center rounded-3xl bg-slate-900/80 border border-slate-800 p-8">
          <h1 className="text-xl font-black font-heading text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-400">
            This page couldn't be shown. Reload to try again, or go back to the home page.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
            >
              Reload
            </button>
            <a
              href="/"
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold"
            >
              Home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
