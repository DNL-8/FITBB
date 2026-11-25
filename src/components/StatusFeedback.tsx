import type React from 'react';
import { Warning, X } from '@phosphor-icons/react';

export const ErrorBanner: React.FC<{ message: string | null; onDismiss?: () => void }> = ({
  message,
  onDismiss,
}) => {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 p-3.5 rounded-lg bg-red-950/35 border border-red-500/40 text-red-200 text-sm"
    >
      <div className="flex items-start gap-2.5">
        <Warning size={18} strokeWidth={1.75} weight="regular" className="text-red-400 shrink-0 mt-0.5" />
        <span className="leading-snug">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar aviso de erro"
          className="text-red-300 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
        >
          <X size={18} strokeWidth={1.75} weight="regular" />
        </button>
      )}
    </div>
  );
};

export const SystemHudSkeleton: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  return (
    <div
      role="status"
      className={embedded ? undefined : 'min-h-screen bg-[#09090B] p-4 text-zinc-100 md:pl-76'}
    >
      <span className="sr-only">Carregando conteúdo</span>
      <div aria-hidden="true" className="mx-auto max-w-6xl space-y-4 pt-4 motion-safe:animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 h-44 rounded-lg bg-[#18181B] border border-[#27272A] p-5 flex flex-col justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-md bg-[#27272A]" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-44 rounded bg-[#27272A]" />
                <div className="h-3.5 w-32 rounded bg-[#27272A]" />
              </div>
            </div>
            <div className="h-2.5 w-full rounded-sm bg-[#27272A]" />
          </div>
          <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-3">
            <div className="h-20 rounded-lg bg-[#18181B] border border-[#27272A] p-4" />
            <div className="h-20 rounded-lg bg-[#18181B] border border-[#27272A] p-4" />
          </div>
        </div>
        <div className="h-44 rounded-lg bg-[#18181B] border border-[#27272A]" />
      </div>
    </div>
  );
};
