import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last line of defence for the extension pages: a readable failure instead of a blank panel. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[quilly] UI crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">Something went wrong</p>
        <pre className="max-w-full overflow-x-auto rounded-md bg-panel-2 p-3 text-left text-xs text-muted">{this.state.error.message}</pre>
        <button className="btn-primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
