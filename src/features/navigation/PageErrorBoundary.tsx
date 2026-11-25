import { Component, type ReactNode } from 'react';

export class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="space-y-3 rounded-lg border border-zinc-700 bg-[#18181B] p-4 text-zinc-100">
        <h2 className="text-base font-semibold">Não foi possível abrir esta página</h2>
        <button type="button" onClick={() => window.location.reload()}
          className="min-h-11 rounded-md bg-orange-500 px-4 text-sm font-semibold text-zinc-950">
          Recarregar página
        </button>
      </section>
    );
  }
}
