import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Erro inesperado" };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Keep a trail in console for faster debugging in production/dev.
    // eslint-disable-next-line no-console
    console.error("App crash:", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background px-6 py-10 text-foreground">
        <h1 className="text-lg font-semibold">O app encontrou um erro.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tente recarregar a página. Se continuar, limpe o cache do navegador.
        </p>
        <p className="mt-2 break-all text-xs text-destructive">{this.state.message}</p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Recarregar
        </button>
      </div>
    );
  }
}

export default AppErrorBoundary;
