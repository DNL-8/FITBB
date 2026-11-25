import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { DeviceMobile, DownloadSimple, ShareNetwork, X } from '@phosphor-icons/react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#F97316] px-3.5 py-2 text-xs sm:text-sm font-semibold text-zinc-950 hover:bg-orange-400 transition-colors whitespace-nowrap cursor-pointer ${className}`}
      >
        <DownloadSimple size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
        <span>{compact ? 'Instalar app' : 'Instalar HunterFit no celular'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <Dialog.Root open={showIOSGuide} onOpenChange={setShowIOSGuide}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3.5 py-2 text-xs sm:text-sm font-semibold text-orange-300 hover:bg-orange-500/20 transition-colors whitespace-nowrap cursor-pointer ${className}`}
          >
            <DeviceMobile size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
            <span>{compact ? 'Instalar (iOS)' : 'Instalar no iPhone / iPad'}</span>
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#27272A] bg-[#18181B] p-5 space-y-4 text-left shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <Dialog.Title className="text-base font-bold text-white">
                  Instalar no iPhone / iPad
                </Dialog.Title>
                <Dialog.Description className="text-xs text-zinc-400">
                  Adicione o HunterFit à Tela de Início para abrir em tela cheia e usar offline na academia.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar guia de instalação"
                  className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  <X size={18} strokeWidth={1.75} weight="regular" />
                </button>
              </Dialog.Close>
            </div>

            <ol className="space-y-2.5 text-sm text-zinc-200">
              <li className="flex items-start gap-2.5 rounded-lg border border-[#27272A] bg-[#111113] p-3">
                <span className="font-mono-tabular tabular-nums text-xs font-bold text-orange-400 mt-0.5">
                  01.
                </span>
                <span>
                  Toque no botão{' '}
                  <strong className="inline-flex items-center gap-1 text-white">
                    Compartilhar <ShareNetwork size={15} className="inline text-orange-400" />
                  </strong>{' '}
                  na barra do Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5 rounded-lg border border-[#27272A] bg-[#111113] p-3">
                <span className="font-mono-tabular tabular-nums text-xs font-bold text-orange-400 mt-0.5">
                  02.
                </span>
                <span>
                  Role e toque em <strong className="text-white">Adicionar à Tela de Início</strong>.
                </span>
              </li>
            </ol>

            <Dialog.Close asChild>
              <button
                type="button"
                className="min-h-[44px] w-full rounded-lg bg-[#27272A] hover:bg-zinc-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer"
              >
                Entendi
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return null;
};
