import React from 'react';
import { serializeError } from '../../utils/errorSerialization';

type ErrorBoundaryState = {
  error: unknown | null;
  message: string;
};

type ErrorBoundaryProps = React.PropsWithChildren & {
  onReset?: () => void;
  onError?: (error: unknown, info: React.ErrorInfo) => void;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      error,
      message: serializeError(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
    console.error('Unhandled application error:', error, info);
  }

  handleReset = () => {
    this.setState({ error: null, message: '' });
    this.props.onReset?.();
  };

  render() {
    const { error, message } = this.state;

    if (error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-red-50 px-4">
          <div className="w-full max-w-lg rounded border border-red-200 bg-white p-6 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-red-700">Something went wrong</h2>
            <p className="mt-2 text-sm text-red-700" role="alert" aria-live="assertive">{message}</p>
            <button
              type="button"
              onClick={this.handleReset}
              className="mt-4 rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
