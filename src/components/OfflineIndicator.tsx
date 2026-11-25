import React from 'react';
import { ArrowsClockwise, CloudSlash, WifiSlash } from '@phosphor-icons/react';

interface OfflineIndicatorProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSyncNow?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  isOnline,
  pendingCount,
  isSyncing,
  onSyncNow,
}) => {
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b px-3 sm:px-6 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${
        !isOnline
          ? 'bg-amber-950/75 border-amber-500/40 text-amber-200'
          : 'bg-orange-950/70 border-orange-500/40 text-orange-200'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {!isOnline ? (
          <WifiSlash size={16} strokeWidth={1.75} weight="regular" className="text-amber-400 shrink-0" />
        ) : (
          <CloudSlash size={16} strokeWidth={1.75} weight="regular" className="text-orange-400 shrink-0" />
        )}
        <span className="font-medium leading-snug">
          {!isOnline ? (
            pendingCount > 0 ? (
              <>
                Modo offline ativo ·{' '}
                <strong className="font-mono-tabular tabular-nums">{pendingCount}</strong>{' '}
                {pendingCount === 1
                  ? 'treino salvo localmente aguardando conexão'
                  : 'treinos salvos localmente aguardando conexão'}
              </>
            ) : (
              'Sem conexão · usando cache local do HunterFit. Seus treinos concluídos serão sincronizados ao reconectar.'
            )
          ) : (
            <>
              <strong className="font-mono-tabular tabular-nums">{pendingCount}</strong>{' '}
              {pendingCount === 1
                ? 'treino salvo offline aguardando sincronização'
                : 'treinos salvos offline aguardando sincronização'}
            </>
          )}
        </span>
      </div>

      {isOnline && pendingCount > 0 && onSyncNow && (
        <button
          type="button"
          disabled={isSyncing}
          onClick={onSyncNow}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-orange-500 hover:bg-orange-400 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-colors cursor-pointer shrink-0"
        >
          <ArrowsClockwise
            size={15}
            strokeWidth={1.75}
            weight="regular"
            className={isSyncing ? 'animate-spin' : ''}
          />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
      )}
    </div>
  );
};
