import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowsClockwise,
  CaretLeft,
  Check,
  CheckCircle,
  Crown,
  Fire,
  Sparkle,
  Sword,
} from '@phosphor-icons/react';
import {
  HeroClass,
  HeroExperience,
  HeroObjective,
  HeroProfile,
} from '../types/fitness';
import { CLASS_CONFIG, HERO_AVATARS, getFriendlyErrorMessage } from '../utils/rpgLogic';
import { CLASS_BONUS_META, ErrorBanner, HeroGlyph, LevelBadge } from './HudPrimitives';

interface OnboardingFlowProps {
  userId: string;
  defaultName: string;
  onCompleteHero: (profile: HeroProfile) => Promise<void>;
}

const ONBOARDING_SLIDES: readonly {
  step: number;
  title: string;
  subtitle: string;
  highlights: readonly string[];
  icon: React.ReactNode;
}[] = [
  {
    step: 1,
    title: 'Treinos guiados e dados reais de saúde',
    subtitle:
      'Execute sessões em Modo Foco ou sincronize corridas e pedais do Strava, Apple Health, GPX e CSV automaticamente.',
    highlights: ['Strava OAuth 2.0', 'Apple Health XML, GPX e CSV'],
    icon: <Sword size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />,
  },
  {
    step: 2,
    title: 'Relatórios de zonas cardíacas e recuperação',
    subtitle:
      'Acompanhe tendências semanais, minutos em Zonas Z1–Z5 e índice de prontidão baseado em carga aguda vs. crônica e sono.',
    highlights: ['Zonas Z1–Z5 personalizadas', 'Índice de Prontidão & ACWR'],
    icon: <Fire size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />,
  },
  {
    step: 3,
    title: 'Configure seu herói e parâmetros fisiológicos',
    subtitle:
      'Escolha sua classe, objetivo e calibre sua frequência cardíaca base para tornar cada leitura de esforço mais precisa.',
    highlights: ['Atributos dinâmicos', 'Oráculo de performance integrado'],
    icon: <Crown size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />,
  },
];

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  userId,
  defaultName,
  onCompleteHero,
}) => {
  const [introStep, setIntroStep] = useState<number>(0);
  const [name, setName] = useState<string>(defaultName);
  const [avatar, setAvatar] = useState<string>('⚔️');
  const [heroClass, setHeroClass] = useState<HeroClass>('Guerreiro');
  const [objective, setObjective] = useState<HeroObjective>('Condicionamento');
  const [experience, setExperience] = useState<HeroExperience>('Iniciante');
  const [restingHrBaseline, setRestingHrBaseline] = useState<number>(60);
  const [maxHrEstimated, setMaxHrEstimated] = useState<number>(190);
  const [heightCmInput, setHeightCmInput] = useState<string>('');
  const [weightKgInput, setWeightKgInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const handleSelectClass = (cls: HeroClass): void => {
    setHeroClass(cls);
    setAvatar(CLASS_CONFIG[cls].emoji);
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setFormError(null);

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      setFormError('O nome do herói deve ter entre 2 e 24 caracteres.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const safeRhr = Number.isFinite(restingHrBaseline) ? restingHrBaseline : 60;
      const safeMaxHr = Number.isFinite(maxHrEstimated) ? maxHrEstimated : 190;
      const parsedHeight = Number(heightCmInput.replace(',', '.'));
      const parsedWeight = Number(weightKgInput.replace(',', '.'));
      const validHeight =
        heightCmInput.trim() !== '' && Number.isFinite(parsedHeight)
          ? Math.min(250, Math.max(100, Math.round(parsedHeight)))
          : null;
      const validWeight =
        weightKgInput.trim() !== '' && Number.isFinite(parsedWeight)
          ? Math.min(350, Math.max(25, Number(parsedWeight.toFixed(1))))
          : null;
      const newProfile: HeroProfile = {
        userId,
        name: trimmed,
        avatar,
        heroClass,
        objective,
        experience,
        heightCm: validHeight,
        weightKg: validWeight,
        restingHrBaseline: Math.min(120, Math.max(30, Math.round(safeRhr))),
        maxHrEstimated: Math.min(220, Math.max(120, Math.round(safeMaxHr))),
        createdAt: now,
        updatedAt: now,
      };
      await onCompleteHero(newProfile);
    } catch (err: unknown) {
      setFormError(getFriendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (introStep < 3) {
    const slide = ONBOARDING_SLIDES[introStep];
    return (
      <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col justify-between px-5 py-8">
        <div className="max-w-md w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sword size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            <span className="text-xs font-bold tracking-wider uppercase text-white">
              Fitness <span className="text-[#F97316]">RPG</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIntroStep(3)}
            className="text-xs font-semibold text-zinc-400 hover:text-white px-3 py-1.5 rounded-md bg-[#18181B] border border-[#27272A] transition-colors cursor-pointer"
          >
            Pular
          </button>
        </div>

        <div className="max-w-md w-full mx-auto text-left space-y-6 my-auto py-8">
          <div className="w-14 h-14 rounded-lg bg-[#18181B] border border-[#27272A] flex items-center justify-center">
            {slide.icon}
          </div>

          <div className="space-y-3">
            <span className="inline-block text-[11px] font-mono-tabular tabular-nums uppercase tracking-wider text-orange-400">
              Etapa {slide.step} de 3
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
              {slide.title}
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">{slide.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {slide.highlights.map((item) => (
              <span
                key={item}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-[#111113] border border-[#27272A] text-zinc-300 flex items-center gap-1.5"
              >
                <Check size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
                {item}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2">
            {ONBOARDING_SLIDES.map((s, idx) => (
              <button
                key={s.step}
                type="button"
                aria-label={`Etapa ${s.step}: ${s.title}`}
                onClick={() => setIntroStep(idx)}
                className={`h-1.5 rounded-sm transition-all cursor-pointer ${
                  idx === introStep
                    ? 'w-10 bg-[#F97316]'
                    : 'w-4 bg-[#27272A] hover:bg-zinc-600'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="max-w-md w-full mx-auto flex items-center gap-3">
          {introStep > 0 && (
            <button
              type="button"
              onClick={() => setIntroStep((prev) => prev - 1)}
              className="px-4 py-3 rounded-md bg-[#18181B] border border-[#27272A] text-zinc-300 font-semibold text-xs hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Voltar
            </button>
          )}
          <button
            type="button"
            onClick={() => setIntroStep((prev) => prev + 1)}
            className="flex-1 py-3.5 px-5 rounded-md bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {introStep === 2 ? 'Configurar meu herói' : 'Próxima etapa'}
            <ArrowRight size={18} strokeWidth={1.75} weight="regular" />
          </button>
        </div>
      </div>
    );
  }

  const selectedBonusMeta = CLASS_BONUS_META[heroClass];

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 px-4 py-8">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIntroStep(2)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white px-3 py-1.5 rounded-md bg-[#18181B] border border-[#27272A] transition-colors cursor-pointer"
          >
            <CaretLeft size={18} strokeWidth={1.75} weight="regular" /> Introdução
          </button>
          <span className="text-xs font-mono-tabular uppercase tracking-wider text-orange-400">
            Registro do jogador
          </span>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`w-12 h-12 rounded-md border flex items-center justify-center shrink-0 ${selectedBonusMeta.ringClass}`}
            >
              <HeroGlyph avatarOrClass={avatar} size={18} className="text-orange-400" />
            </div>
            <div className="min-w-0 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-400">
                Prévia do personagem
              </div>
              <h2 className="text-base font-bold text-white truncate">
                {name.trim() || 'Seu herói'}
              </h2>
              <p className="text-xs text-zinc-400">
                {heroClass} · {experience} · {objective}
              </p>
            </div>
          </div>
          <LevelBadge level={1} size="sm" showHunterRank />
        </div>

        <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />

        <form
          onSubmit={(e) => void handleCreateSubmit(e)}
          className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 sm:p-6 space-y-5 text-left"
        >
          <div>
            <label
              htmlFor="hero-name"
              className="block text-xs font-semibold text-zinc-300 mb-1.5"
            >
              Nome do herói
            </label>
            <input
              id="hero-name"
              type="text"
              required
              minLength={2}
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Sung Jin, Valkyria, Arthur..."
              className="w-full px-3.5 py-2.5 rounded-md bg-[#111113] border border-[#27272A] text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 text-sm font-medium"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-zinc-300 mb-2">
              Classe de combate
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(['Guerreiro', 'Arqueiro', 'Mago'] as const).map((cls) => {
                const info = CLASS_CONFIG[cls];
                const bonus = CLASS_BONUS_META[cls];
                const selected = heroClass === cls;
                return (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => handleSelectClass(cls)}
                    className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#111113] border-[#F97316]'
                        : 'bg-[#111113] border-[#27272A] hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <HeroGlyph
                        avatarOrClass={cls}
                        size={18}
                        className={selected ? 'text-orange-400' : 'text-zinc-400'}
                      />
                      {selected && <CheckCircle size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />}
                    </div>
                    <div className="font-bold text-sm text-white">{info.title}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                      {info.specialty}
                    </div>
                    <div className="text-[11px] font-mono-tabular text-zinc-300 mt-2">
                      {bonus.bonuses.join(' · ')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-zinc-300 mb-2">
              Emblema do avatar
            </span>
            <div className="grid grid-cols-6 gap-2">
              {HERO_AVATARS.map((item) => {
                const isSelected = avatar === item.emoji;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAvatar(item.emoji)}
                    title={item.label}
                    aria-label={item.label}
                    className={`h-11 rounded-md flex items-center justify-center border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-orange-500/10 border-[#F97316] text-orange-400'
                        : 'bg-[#111113] border-[#27272A] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    <HeroGlyph
                      avatarOrClass={item.id}
                      size={18}
                      className={isSelected ? 'text-orange-400' : 'text-zinc-400'}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="hero-height"
                className="block text-xs font-semibold text-zinc-300 mb-1.5"
              >
                Altura (cm)
              </label>
              <input
                id="hero-height"
                type="number"
                min={100}
                max={250}
                placeholder="Ex: 180"
                value={heightCmInput}
                onChange={(e) => setHeightCmInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-md bg-[#111113] border border-[#27272A] text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 text-sm font-mono-tabular tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="hero-weight"
                className="block text-xs font-semibold text-zinc-300 mb-1.5"
              >
                Peso atual (kg)
              </label>
              <input
                id="hero-weight"
                type="number"
                min={25}
                max={350}
                step="0.1"
                placeholder="Ex: 108"
                value={weightKgInput}
                onChange={(e) => setWeightKgInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-md bg-[#111113] border border-[#27272A] text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 text-sm font-mono-tabular tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="hero-rhr"
                className="block text-xs font-semibold text-zinc-300 mb-1.5"
              >
                FC de repouso base (bpm)
              </label>
              <input
                id="hero-rhr"
                type="number"
                min={30}
                max={120}
                value={restingHrBaseline}
                onChange={(e) => setRestingHrBaseline(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-md bg-[#111113] border border-[#27272A] text-white focus:outline-none focus:border-orange-500 text-sm font-mono-tabular tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="hero-maxhr"
                className="block text-xs font-semibold text-zinc-300 mb-1.5"
              >
                FC máxima estimada (bpm)
              </label>
              <input
                id="hero-maxhr"
                type="number"
                min={120}
                max={220}
                value={maxHrEstimated}
                onChange={(e) => setMaxHrEstimated(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-md bg-[#111113] border border-[#27272A] text-white focus:outline-none focus:border-orange-500 text-sm font-mono-tabular tabular-nums"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-zinc-300 mb-2">
              Objetivo principal
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['Emagrecer', 'Condicionamento', 'Ambos'] as const).map((obj) => (
                <button
                  key={obj}
                  type="button"
                  onClick={() => setObjective(obj)}
                  className={`py-2.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                    objective === obj
                      ? 'bg-[#F97316] text-zinc-950 border-[#F97316]'
                      : 'bg-[#111113] text-zinc-400 border-[#27272A] hover:text-zinc-200'
                  }`}
                >
                  {obj}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-zinc-300 mb-2">
              Experiência física
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['Iniciante', 'Intermediário', 'Avançado'] as const).map((exp) => (
                <button
                  key={exp}
                  type="button"
                  onClick={() => setExperience(exp)}
                  className={`py-2.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                    experience === exp
                      ? 'bg-orange-500/10 text-orange-400 border-orange-500/45'
                      : 'bg-[#111113] text-zinc-400 border-[#27272A] hover:text-zinc-200'
                  }`}
                >
                  {exp}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 px-5 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {saving ? (
              <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />
            ) : (
              <Sparkle size={18} strokeWidth={1.75} weight="regular" />
            )}
            Criar herói e iniciar
          </button>
        </form>
      </div>
    </div>
  );
};
