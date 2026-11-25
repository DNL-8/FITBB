import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { ArrowsClockwise, Fire, Heartbeat, ShieldCheck, Sword } from '@phosphor-icons/react';
import { auth, authUsesAppDomain } from '../firebaseApp';
import { getFriendlyErrorMessage } from '../utils/errors';
import { ErrorBanner } from './StatusFeedback';

interface AuthScreenProps {
  authError: string | null;
  onError: (msg: string) => void;
  clearError: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  authError,
  onError,
  clearError,
}) => {
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleGoogleLogin = async (): Promise<void> => {
    clearError();
    setSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      const agent = navigator.userAgent;
      const isAppleMobile = /iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
      if (isAppleMobile && authUsesAppDomain) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err: unknown) {
      onError(getFriendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col justify-center px-4 py-12">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="space-y-3 text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#18181B] border border-[#27272A] flex items-center justify-center shrink-0">
              <Sword size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            </div>
            <div>
              <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-zinc-500">
                Sistema de progressão & saúde
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Fitness <span className="text-[#F97316]">RPG</span>
              </h1>
            </div>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Monitore treinos reais via Strava, Apple Health, Samsung Health, GPX e CSV com progressão de atributos, chefes e Arsenal.
          </p>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 sm:p-6 space-y-5">
          <div className="space-y-2.5 text-xs text-zinc-300">
            <div className="flex items-start gap-3 p-3 rounded-md bg-[#111113] border border-[#27272A]">
              <Heartbeat size={18} strokeWidth={1.75} weight="regular" className="text-orange-400 shrink-0 mt-0.5" />
              <span>Integração direta com Strava OAuth e arquivos Samsung Health, Apple Health, GPX e CSV.</span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-[#111113] border border-[#27272A]">
              <Fire size={18} strokeWidth={1.75} weight="regular" className="text-orange-400 shrink-0 mt-0.5" />
              <span>Combate contra chefes, zonas cardíacas Z1–Z5, prontidão e Arsenal com Moedas de Ouro.</span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-[#111113] border border-[#27272A]">
              <ShieldCheck size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400 shrink-0 mt-0.5" />
              <span>Sincronização segura associada à sua conta Google.</span>
            </div>
          </div>

          <ErrorBanner message={authError} onDismiss={clearError} />

          <button
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={submitting}
            className="w-full min-h-[44px] py-3 px-4 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
          >
            {submitting ? (
              <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />
            ) : (
              <span className="w-5 h-5 rounded-sm bg-zinc-950 text-white font-bold text-xs flex items-center justify-center">
                G
              </span>
            )}
            {submitting ? 'Conectando...' : 'Entrar com Google'}
          </button>
        </div>
      </div>
    </div>
  );
};
