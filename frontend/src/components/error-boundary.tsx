import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { CircleX } from "lucide-react";

type ErrorBoundaryProps = {
  children: ReactNode;
  pageName?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`ErrorBoundary${this.props.pageName ? ` [${this.props.pageName}]` : ""} caught:`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <EmptyState
            title={`Fehler in${this.props.pageName ? ` "${this.props.pageName}"` : ""}`}
            text={this.state.error?.message ?? "Unerwarteter Fehler"}
            illustration={<CircleX />}
          />
          <Button variant="secondary" onClick={this.handleReset}>
            Neu laden
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
