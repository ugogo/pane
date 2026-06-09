import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AppBootFailure } from '@/components/app-boot-failure';
import { formatAppError } from '@/lib/format-app-error';

type AppErrorBoundaryProps = {
  children: ReactNode;
  renderFallback?: (message: string) => ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Pane render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const message = formatAppError(this.state.error);
      if (this.props.renderFallback) {
        return this.props.renderFallback(message);
      }

      return (
        <AppBootFailure title="Pane ran into a problem" message={message} />
      );
    }

    return this.props.children;
  }
}
