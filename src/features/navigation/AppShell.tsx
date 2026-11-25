import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowsLeftRight,
  CaretRight,
  Coins,
  Compass,
  Fire,
  Heartbeat,
  Shield,
  Sparkle,
  SquaresFour,
  Sword,
  Terminal,
  User,
} from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CLASS_BONUS_META, XpProgressBar } from '../../components/HudPrimitives';
import { ShadowKnightSprite } from '../../components/ShadowKnightSprite';
import { PWAInstallButton } from '../../components/PWAInstallButton';
import type { GameStats, HeroProfile, NavTab } from '../../types/fitness';
import { getDualProgressionStatus, getEffectiveCurrentStreak } from '../../utils/rpgLogic';

const desktopNavItems: ReadonlyArray<{
  id: NavTab;
  label: string;
  icon: (isActive: boolean) => ReactNode;
}> = [
  {
    id: 'inicio',
    label: 'Início',
    icon: (isActive) => (
      <Fire
        size={18} strokeWidth={1.75}
        weight="regular"
        className={isActive ? 'text-[#F97316] shrink-0' : 'text-zinc-400 shrink-0'}
      />
    ),
  },
  {
    id: 'painel',
    label: 'Painel',
    icon: (isActive) => (
      <SquaresFour
        size={18} strokeWidth={1.75}
        weight="regular"
        className={isActive ? 'text-[#F97316] shrink-0' : 'text-zinc-400 shrink-0'}
      />
    ),
  },
  {
    id: 'treinar',
    label: 'Treinar',
    icon: (isActive) => (
      <Sword
        size={18} strokeWidth={1.75}
        weight="regular"
        className={isActive ? 'text-[#F97316] shrink-0' : 'text-zinc-400 shrink-0'}
      />
    ),
  },
  {
    id: 'arsenal',
    label: 'Arsenal',
    icon: (isActive) => (
      <Shield
        size={18} strokeWidth={1.75}
        weight="regular"
        className={isActive ? 'text-[#F97316] shrink-0' : 'text-zinc-400 shrink-0'}
      />
    ),
  },
  {
    id: 'progresso',
    label: 'Relatórios',
    icon: (isActive) => (
      <Heartbeat
        size={18} strokeWidth={1.75}
        weight="regular"
        className={isActive ? 'text-[#F97316] shrink-0' : 'text-zinc-400 shrink-0'}
      />
    ),
  },
  {
    id: 'coach',
    label: 'Oráculo',
    icon: (isActive) => (
      <Sparkle
        size={18} strokeWidth={1.75}
        weight="regular"
        className={isActive ? 'text-[#F97316] shrink-0' : 'text-zinc-400 shrink-0'}
      />
    ),
  },
  {
    id: 'api',
    label: 'API',
    icon: (isActive) => (
      <Terminal
        size={18} strokeWidth={1.75}
        weight="regular"
        className={isActive ? 'text-[#F97316] shrink-0' : 'text-zinc-400 shrink-0'}
      />
    ),
  },
  {
    id: 'perfil',
    label: 'Perfil',
    icon: (isActive) => (
      <User
        size={18} strokeWidth={1.75}
        weight="regular"
        className={isActive ? 'text-[#F97316] shrink-0' : 'text-zinc-400 shrink-0'}
      />
    ),
  },
];

const mobileNavItems = desktopNavItems.filter(
  (item) => item.id !== 'perfil' && item.id !== 'api' && item.id !== 'painel'
);

interface AppShellProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  heroProfile: HeroProfile;
  safeStats: GameStats;
  children: ReactNode;
}

export function AppShell({ activeTab, setActiveTab, heroProfile, safeStats, children }: AppShellProps) {
  const [heroTitleRealm, setHeroTitleRealm] = useState<'hunter' | 'murim'>('hunter');

  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setHeroTitleRealm((prev) => (prev === 'hunter' ? 'murim' : 'hunter'));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const effectiveStreak = getEffectiveCurrentStreak(
    safeStats.currentStreak,
    safeStats.lastWorkoutDate
  );
  const dualProgression = useMemo(() => getDualProgressionStatus(safeStats), [safeStats]);

  return (
    <div className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10 bg-[#09090B] text-zinc-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-md focus:bg-[#F97316] focus:text-[#09090B] focus:font-semibold focus:text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
      >
        Pular para o conteúdo principal
      </a>
      <aside
        aria-label="Navegação lateral desktop"
        className="hidden lg:flex lg:w-72 lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 z-30 border-r bg-[#111113] border-[#27272A] p-4 justify-between overflow-y-auto"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-[#18181B] border border-[#27272A] flex items-center justify-center shrink-0">
                <Sword size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
              </div>
              <div>
                <div className="font-display font-bold tracking-tight text-sm leading-none text-zinc-100">
                  FITNESS <span className="text-[#F97316]">RPG</span>
                </div>
                <div className="text-[11px] font-medium mt-1 text-zinc-500">
                  Sistema de caçador
                </div>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border grid gap-3 bg-[#18181B] border-[#27272A]">
            <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
              <div
                className={`w-11 h-11 rounded-md border flex items-center justify-center bg-[#111113] ${
                  CLASS_BONUS_META[heroProfile.heroClass].ringClass
                }`}
              >
                <ShadowKnightSprite equippedGear={safeStats.equippedGear} size="sm" />
              </div>

              <div className="min-w-0 grid gap-1">
                {/* Linha 1: Nome e Nível */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
                  <span className="font-display font-semibold text-sm leading-tight truncate text-zinc-100">
                    {heroProfile.name}
                  </span>
                  <span className="text-xs font-semibold font-mono-tabular tabular-nums text-zinc-300 shrink-0">
                    Nv. {dualProgression.hunter.level}
                  </span>
                </div>

                {/* Linha 2: Rank de Caçador e Reino Murim alternáveis (30s) */}
                <button
                  type="button"
                  onClick={() =>
                    setHeroTitleRealm((prev) =>
                      prev === 'hunter' ? 'murim' : 'hunter'
                    )
                  }
                  title="Alternar título entre Rank de Caçador e Reino Murim"
                  aria-live="polite"
                  className="group min-w-0 w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 text-left text-xs font-medium transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/60"
                >
                  <div className="min-w-0 overflow-hidden">
                    <AnimatePresence mode="wait" initial={false}>
                      {heroTitleRealm === 'hunter' ? (
                        <motion.span
                          key={`hunter-${dualProgression.hunter.current.rank}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.14, ease: [0.2, 0.75, 0.25, 1] }}
                          className="inline-flex items-center gap-1.5 text-orange-400 group-hover:text-orange-300 leading-snug"
                        >
                          <Compass size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
                          <span className="truncate">
                            {dualProgression.hunter.current.label}
                          </span>
                        </motion.span>
                      ) : (
                        <motion.span
                          key={`murim-${dualProgression.murim.current.id}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.14, ease: [0.2, 0.75, 0.25, 1] }}
                          className="inline-flex items-center gap-1.5 text-zinc-200 group-hover:text-white leading-snug"
                        >
                          <Sword size={18} strokeWidth={1.75} weight="regular" className="shrink-0 text-emerald-400" />
                          <span className="leading-snug truncate">
                            {dualProgression.murim.current.name}
                          </span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <ArrowsLeftRight
                    size={18} strokeWidth={1.75}
                    weight="regular"
                    className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0"
                  />
                </button>
              </div>
            </div>

            <div className="pt-2.5 border-t border-[#27272A] grid grid-cols-1 justify-items-center gap-2.5 min-w-0">
              <XpProgressBar totalXp={safeStats.totalXp} compact />

              <button
                type="button"
                onClick={() => setActiveTab('arsenal')}
                className="w-full pt-2 border-t border-[#27272A] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100 transition-colors group rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/60"
              >
                <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-200 font-mono-tabular tabular-nums">
                  <Coins size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316] shrink-0" />
                  {(safeStats.goldCoins ?? 0).toLocaleString('pt-BR')} moedas
                </span>
                <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-zinc-400 group-hover:text-orange-400 transition-colors">
                  Arsenal
                  <CaretRight
                    size={18} strokeWidth={1.75}
                    weight="regular"
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </button>
            </div>
          </div>

          <nav aria-label="Menu principal" className="space-y-1">
            {desktopNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`ui-press relative isolate flex min-h-10 w-full items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${
                    isActive
                      ? 'font-semibold text-zinc-100'
                      : 'font-medium text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      aria-hidden="true"
                      layoutId="desktop-active-navigation"
                      transition={{ type: 'spring', stiffness: 470, damping: 38 }}
                      className="pointer-events-none absolute inset-0 -z-10 rounded-md border border-orange-500/45 bg-orange-500/8"
                    />
                  )}
                  {item.icon(isActive)}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2.5">
          <PWAInstallButton className="w-full" />
          <div className="p-3 rounded-lg border flex items-center justify-between text-xs bg-[#18181B] border-[#27272A]">
            <span className="font-medium flex items-center gap-2 text-zinc-400">
              <Fire size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
              Sequência atual
            </span>
            <span className="font-semibold font-mono-tabular tabular-nums text-zinc-100">
              {effectiveStreak} {effectiveStreak === 1 ? 'dia' : 'dias'}
            </span>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="lg:hidden sticky top-0 z-20 border-b px-3.5 h-14 flex items-center justify-between gap-2 bg-[#111113] border-[#27272A]">
          <div className="flex min-w-0 items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#18181B] border border-[#27272A] flex items-center justify-center shrink-0">
              <Sword size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
            </div>
            <span className="truncate font-display text-sm font-bold tracking-tight text-zinc-100 max-[360px]:sr-only">
              FITNESS <span className="text-[#F97316]">RPG</span>
            </span>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-1.5 max-[420px]:shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('arsenal')}
              aria-label="Abrir Arsenal e Moedas"
              className="inline-flex shrink-0 items-center gap-1 px-2 py-1 rounded-sm bg-[#18181B] border border-[#27272A] text-[11px] font-semibold text-zinc-200 font-mono-tabular tabular-nums whitespace-nowrap"
            >
              <Coins size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
              {(safeStats.goldCoins ?? 0).toLocaleString('pt-BR')}
            </button>
            <button
              type="button"
              onClick={() =>
                setHeroTitleRealm((prev) => (prev === 'hunter' ? 'murim' : 'hunter'))
              }
              title="Alternar título entre Rank de Caçador e Reino Marcial"
              aria-label="Alternar título entre Rank de Caçador e Reino Marcial"
              className={`inline-flex min-w-9 items-center gap-1 px-2 py-1 rounded-sm border text-[11px] font-medium whitespace-nowrap max-w-[136px] transition-colors bg-[#18181B] ${
                heroTitleRealm === 'hunter'
                  ? 'border-orange-500/40 text-orange-400'
                  : 'border-[#27272A] text-zinc-200'
              }`}
            >
              {heroTitleRealm === 'hunter' ? (
                <>
                  <Compass size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
                  <span className="truncate max-[420px]:hidden">
                    {dualProgression.hunter.current.label}
                  </span>
                </>
              ) : (
                <>
                  <Sword size={18} strokeWidth={1.75} weight="regular" className="shrink-0 text-emerald-400" />
                  <span className="truncate max-[420px]:hidden">
                    {dualProgression.murim.current.name}
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('painel')}
              aria-label="Abrir Painel de Controle"
              className={`w-9 h-9 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                activeTab === 'painel'
                  ? 'bg-[#18181B] border-orange-500/50 text-[#F97316]'
                  : 'bg-[#18181B] border-[#27272A] text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <SquaresFour size={18} strokeWidth={1.75} weight="regular" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('api')}
              aria-label="Abrir Central de Comandos API"
              className={`w-9 h-9 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                activeTab === 'api'
                  ? 'bg-[#18181B] border-orange-500/50 text-[#F97316]'
                  : 'bg-[#18181B] border-[#27272A] text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Terminal size={18} strokeWidth={1.75} weight="regular" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('perfil')}
              aria-label="Abrir Perfil do Herói"
              className={`w-9 h-9 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                activeTab === 'perfil'
                  ? 'bg-[#18181B] border-orange-500/50 text-[#F97316]'
                  : 'bg-[#18181B] border-[#27272A] text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <User size={18} strokeWidth={1.75} weight="regular" />
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 lg:pt-7 focus:outline-none">
          {children}
        </main>
      </div>

      <nav
        aria-label="Navegação principal mobile"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t px-2 pt-1.5 pb-[calc(.375rem+env(safe-area-inset-bottom))] h-[calc(4rem+env(safe-area-inset-bottom))] bg-[#111113] border-[#27272A]"
      >
        <div className="grid grid-cols-5 gap-1 h-full">
          {mobileNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`ui-press relative isolate flex flex-col items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-orange-400 ${
                  isActive
                    ? 'font-semibold text-orange-400'
                    : 'font-medium text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isActive && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="mobile-active-navigation"
                    transition={{ type: 'spring', stiffness: 470, damping: 38 }}
                    className="pointer-events-none absolute inset-0 -z-10 rounded-md border border-orange-500/45 bg-orange-500/10"
                  />
                )}
                {item.icon(isActive)}
                <span className="text-[11px] mt-0.5 tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
