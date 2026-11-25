import React, { useMemo, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  ArrowCounterClockwise,
  Check,
  Compass,
  Flask,
  Heartbeat,
  Lightning,
  Lock,
  PencilSimple,
  Shield,
  ShieldWarning,
  SignOut,
  Sword,
  Target,
  X,
} from '@phosphor-icons/react';
import {
  GameStats,
  HeroClass,
  HeroExperience,
  HeroObjective,
  HeroProfile,
  TestCaseResult,
  UserAchievement,
} from '../types/fitness';
import {
  ACHIEVEMENT_DEFINITIONS,
  DAYS_PER_RANK_BASELINE,
  HERO_AVATARS,
  HUNTER_RANK_TIERS,
  MURIM_REALM_TIERS,
  WEEKLY_PACE_BASELINE_LABEL,
  calculateDerivedAttributes,
  computeBmiSummary,
  getDualProgressionStatus,
  getEffectiveCurrentStreak,
  getFriendlyErrorMessage,
  getHunterRankStartXp,
  normalizeGameStats,
} from '../utils/rpgLogic';
import {
  AchievementGlyph,
  AttributeRadarChart,
  CLASS_BONUS_META,
  ErrorBanner,
  HeroGlyph,
  LevelBadge,
} from './HudPrimitives';
import { ShadowKnightSprite } from './ShadowKnightSprite';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileViewProps {
  user: FirebaseUser;
  hero: HeroProfile;
  stats: GameStats;
  achievements: UserAchievement[];
  exercisePrsCount?: number;
  weeklyRaidDefeated?: boolean;
  onUpdateProfile: (updated: HeroProfile) => Promise<void>;
  onResetProgress: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  hero,
  stats,
  achievements,
  exercisePrsCount = 0,
  weeklyRaidDefeated: _weeklyRaidDefeated = false,
  onUpdateProfile,
  onResetProgress,
  onLogout,
}) => {
  const normalizedStats = useMemo(() => normalizeGameStats(stats), [stats]);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>(hero.name);
  const [editAvatar, setEditAvatar] = useState<string>(hero.avatar);
  const [editClass, setEditClass] = useState<HeroClass>(hero.heroClass);
  const [editObjective, setEditObjective] = useState<HeroObjective>(hero.objective);
  const [editExperience, setEditExperience] = useState<HeroExperience>(hero.experience);
  const [editRestingHr, setEditRestingHr] = useState<number>(hero.restingHrBaseline ?? 60);
  const [editMaxHr, setEditMaxHr] = useState<number>(hero.maxHrEstimated ?? 190);
  const [editHeightCm, setEditHeightCm] = useState<string>(
    hero.heightCm ? String(hero.heightCm) : ''
  );
  const [editWeightKg, setEditWeightKg] = useState<string>(
    hero.weightKg ? String(hero.weightKg) : ''
  );
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [resetAcknowledged, setResetAcknowledged] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showTestsPanel, setShowTestsPanel] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);
  const [loadingTests, setLoadingTests] = useState<boolean>(false);
  const [dualTab, setDualTab] = useState<'hunter' | 'murim'>('hunter');

  const dualProgression = useMemo(
    () => getDualProgressionStatus(normalizedStats),
    [normalizedStats]
  );

  const attributes = useMemo(
    () => calculateDerivedAttributes(stats, hero.heroClass),
    [stats, hero.heroClass]
  );

  const allTestsPassed = testResults ? testResults.every((t) => t.passed) : true;

  const handleToggleTestsPanel = async (): Promise<void> => {
    const nextOpen = !showTestsPanel;
    setShowTestsPanel(nextOpen);
    if (nextOpen && !testResults && !loadingTests) {
      setLoadingTests(true);
      try {
        const mod = await import('../utils/rpgLogic.test');
        setTestResults(mod.runGameLogicTests());
      } finally {
        setLoadingTests(false);
      }
    }
  };

  const unlockedAchievements = useMemo(
    () =>
      ACHIEVEMENT_DEFINITIONS.filter((def) =>
        achievements.some((a) => a.id === def.id && a.unlocked)
      ),
    [achievements]
  );

  const effectiveStreak = getEffectiveCurrentStreak(
    stats.currentStreak,
    stats.lastWorkoutDate
  );

  const bmiSummary = useMemo(
    () => computeBmiSummary(hero.heightCm, hero.weightKg),
    [hero.heightCm, hero.weightKg]
  );

  const openEditModal = (): void => {
    setEditName(hero.name);
    setEditAvatar(hero.avatar);
    setEditClass(hero.heroClass);
    setEditObjective(hero.objective);
    setEditExperience(hero.experience);
    setEditRestingHr(hero.restingHrBaseline ?? 60);
    setEditMaxHr(hero.maxHrEstimated ?? 190);
    setEditHeightCm(hero.heightCm ? String(hero.heightCm) : '');
    setEditWeightKg(hero.weightKg ? String(hero.weightKg) : '');
    setProfileError(null);
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const trimmed = editName.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      setProfileError('O nome do herói deve ter entre 2 e 24 caracteres.');
      return;
    }

    setSavingEdit(true);
    setProfileError(null);
    try {
      const safeRhr = Number.isFinite(editRestingHr) ? editRestingHr : 60;
      const safeMaxHr = Number.isFinite(editMaxHr) ? editMaxHr : 190;
      const parsedHeight = Number(editHeightCm.replace(',', '.'));
      const parsedWeight = Number(editWeightKg.replace(',', '.'));
      const safeHeightCm =
        editHeightCm.trim() !== '' && Number.isFinite(parsedHeight)
          ? Math.min(250, Math.max(100, Math.round(parsedHeight)))
          : null;
      const safeWeightKg =
        editWeightKg.trim() !== '' && Number.isFinite(parsedWeight)
          ? Math.min(350, Math.max(25, Number(parsedWeight.toFixed(1))))
          : null;

      await onUpdateProfile({
        ...hero,
        name: trimmed,
        avatar: editAvatar,
        heroClass: editClass,
        objective: editObjective,
        experience: editExperience,
        heightCm: safeHeightCm,
        weightKg: safeWeightKg,
        restingHrBaseline: Math.min(120, Math.max(30, Math.round(safeRhr))),
        maxHrEstimated: Math.min(220, Math.max(120, Math.round(safeMaxHr))),
        updatedAt: new Date().toISOString(),
      });
      setIsEditing(false);
    } catch (err: unknown) {
      setProfileError(getFriendlyErrorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmReset = async (): Promise<void> => {
    if (!resetAcknowledged) return;
    setResetting(true);
    setProfileError(null);
    try {
      await onResetProgress();
      setResetStep(0);
      setResetAcknowledged(false);
    } catch (err: unknown) {
      setProfileError(getFriendlyErrorMessage(err));
    } finally {
      setResetting(false);
    }
  };

  const attributeList: Array<{
    key: string;
    label: string;
    value: number;
    icon: React.ReactNode;
    barColor: string;
    hint: string;
  }> = [
    {
      key: 'forca',
      label: 'Força',
      value: attributes.forca,
      icon: <Sword size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />,
      barColor: 'bg-[#F97316]',
      hint: 'Força e corpo inteiro',
    },
    {
      key: 'resistencia',
      label: 'Resistência',
      value: attributes.resistencia,
      icon: <Heartbeat size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />,
      barColor: 'bg-[#10B981]',
      hint: 'Cardio, HIIT e minutos',
    },
    {
      key: 'agilidade',
      label: 'Agilidade',
      value: attributes.agilidade,
      icon: <Lightning size={18} strokeWidth={1.75} weight="regular" className="text-amber-400" />,
      barColor: 'bg-amber-400',
      hint: 'HIIT e mobilidade',
    },
    {
      key: 'disciplina',
      label: 'Disciplina',
      value: attributes.disciplina,
      icon: <Shield size={18} strokeWidth={1.75} weight="regular" className="text-zinc-300" />,
      barColor: 'bg-zinc-300',
      hint: 'Streaks e consistência',
    },
  ];

  return (
    <div className="space-y-5 text-left">
      <ErrorBanner message={profileError} onDismiss={() => setProfileError(null)} />

      <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div
              className={`w-16 h-16 rounded-lg border bg-[#111113] flex items-center justify-center shrink-0 ${
                CLASS_BONUS_META[hero.heroClass].ringClass
              }`}
            >
              <ShadowKnightSprite equippedGear={normalizedStats.equippedGear} size="md" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">{hero.name}</h1>
              <div className="mt-1">
                <LevelBadge level={normalizedStats.level} size="sm" showHunterRank />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openEditModal}
            className="min-h-[40px] px-3.5 py-2 rounded-md bg-[#111113] hover:bg-zinc-800 border border-[#27272A] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <PencilSimple size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            Editar
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
          <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Classe</div>
            <div className="text-xs font-bold text-white mt-1 flex items-center gap-1.5">
              <HeroGlyph avatarOrClass={hero.heroClass} size={18} className="text-orange-400" />
              <span>{hero.heroClass}</span>
            </div>
          </div>
          <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Objetivo</div>
            <div className="text-xs font-bold text-white mt-1">{hero.objective}</div>
          </div>
          <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Experiência</div>
            <div className="text-xs font-bold text-white mt-1">{hero.experience}</div>
          </div>
          <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">FC repouso</div>
            <div className="text-xs font-bold text-zinc-200 mt-1 font-mono-tabular tabular-nums">
              {hero.restingHrBaseline ?? 60} bpm
            </div>
          </div>
          <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] col-span-2 sm:col-span-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">FC máxima</div>
            <div className="text-xs font-bold text-orange-400 mt-1 font-mono-tabular tabular-nums">
              {hero.maxHrEstimated ?? 190} bpm
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Altura</div>
            <div className="text-xs font-bold text-white mt-1 font-mono-tabular tabular-nums">
              {hero.heightCm ? `${hero.heightCm} cm` : '—'}
            </div>
          </div>
          <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Peso</div>
            <div className="text-xs font-bold text-white mt-1 font-mono-tabular tabular-nums">
              {hero.weightKg ? `${hero.weightKg} kg` : '—'}
            </div>
          </div>
          <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">IMC</div>
            <div className="text-xs font-bold text-emerald-400 mt-1 font-mono-tabular tabular-nums">
              {bmiSummary ? `${bmiSummary.bmi} · ${bmiSummary.label}` : '—'}
            </div>
          </div>
        </div>
      </section>

      {/* Jornada nos Dois Mundos: Rankings de Caçador (Mundo Real) & Reinos Marciais (Murim) */}
      <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
              Jornada nos dois mundos
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono-tabular tabular-nums">
              Evolução paralela entre Caçador (XP) e Reinos de Murim (Qi) · ~{DAYS_PER_RANK_BASELINE} dias por estágio ({WEEKLY_PACE_BASELINE_LABEL}).
            </p>
          </div>

          <div className="inline-grid grid-cols-2 p-1 rounded-md bg-[#111113] border border-[#27272A] gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setDualTab('hunter')}
              className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                dualTab === 'hunter'
                  ? 'bg-[#F97316] text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Mundo Real (F–S)
            </button>
            <button
              type="button"
              onClick={() => setDualTab('murim')}
              className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                dualTab === 'murim'
                  ? 'bg-[#F97316] text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Murim (8 Reinos)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-orange-400">
                Mundo Real · Caçador
              </span>
              <span className="text-xs font-bold text-white font-mono-tabular tabular-nums">
                {dualProgression.hunter.current.label}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-white font-mono-tabular tabular-nums">
                Nível {dualProgression.hunter.level} · Nv. {dualProgression.hunter.current.minLevel}–{dualProgression.hunter.current.maxLevel}
              </span>
              <span className="text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
                {normalizedStats.totalXp.toLocaleString('pt-BR')} XP
              </span>
            </div>
            <div className="w-full h-1.5 rounded-sm bg-[#09090B] overflow-hidden border border-[#27272A]">
              <div
                className="h-full rounded-sm bg-[#F97316] transition-all duration-500"
                style={{ width: `${dualProgression.hunter.progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
              <span>{dualProgression.hunter.progressPercent}% do rank atual</span>
              <span className="truncate">
                {dualProgression.hunter.next
                  ? `Próx: ${dualProgression.hunter.next.label} (${dualProgression.hunter.xpNeededForNextRank.toLocaleString('pt-BR')} XP · ~${dualProgression.hunter.estimatedDaysToNextRank} dias)`
                  : 'Rank S alcançado'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                Murim · Maestria de Qi
              </span>
              <span className="text-xs font-bold text-white font-mono-tabular tabular-nums">
                {dualProgression.murim.qiPoints.toLocaleString('pt-BR')} Qi
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-white truncate">
                {dualProgression.murim.current.name}
              </span>
              <span className="text-[11px] text-zinc-400 font-medium shrink-0">
                {dualProgression.murim.current.qiTechnique}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-sm bg-[#09090B] overflow-hidden border border-[#27272A]">
              <div
                className="h-full rounded-sm bg-[#10B981] transition-all duration-500"
                style={{ width: `${dualProgression.murim.progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
              <span>{dualProgression.murim.progressPercent}% do reino atual</span>
              <span className="truncate">
                {dualProgression.murim.next
                  ? `Próx: ${dualProgression.murim.next.name} (${dualProgression.murim.qiNeededForNext.toLocaleString('pt-BR')} Qi · ~${dualProgression.murim.estimatedDaysToNextRealm} dias)`
                  : 'Reino Supremo alcançado'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 pt-0.5 text-center font-mono-tabular tabular-nums text-[10px]">
              <div className="rounded-sm bg-[#09090B] border border-[#27272A] px-1.5 py-1 text-zinc-300">
                Treinos +{dualProgression.murim.breakdown.fromWorkouts}
              </div>
              <div className="rounded-sm bg-[#09090B] border border-[#27272A] px-1.5 py-1 text-zinc-300">
                Chefes +{dualProgression.murim.breakdown.fromBosses}
              </div>
              <div className="rounded-sm bg-[#09090B] border border-[#27272A] px-1.5 py-1 text-zinc-300">
                Streak +{dualProgression.murim.breakdown.fromStreak}
              </div>
              <div className="rounded-sm bg-[#09090B] border border-[#27272A] px-1.5 py-1 text-zinc-300">
                Tempo +{dualProgression.murim.breakdown.fromMinutes}
              </div>
            </div>
          </div>
        </div>

        {dualTab === 'hunter' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {HUNTER_RANK_TIERS.map((tier, idx) => {
              const isCurrent = dualProgression.hunter.current.rank === tier.rank;
              const isUnlocked = normalizedStats.level >= tier.minLevel;
              const minXpRequired = getHunterRankStartXp(tier.rank);
              const milestoneDay = idx === 0 ? 1 : idx * DAYS_PER_RANK_BASELINE;
              return (
                <div
                  key={tier.rank}
                  className={`p-3 rounded-md border transition-colors ${
                    isCurrent
                      ? 'bg-[#111113] border-[#F97316]'
                      : isUnlocked
                      ? 'bg-[#111113] border-[#27272A]'
                      : 'bg-[#09090B] border-[#27272A] opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded-sm bg-[#09090B] border border-[#27272A] text-xs font-bold text-white font-mono-tabular tabular-nums shrink-0">
                        {tier.label}
                      </span>
                      <span className="text-[11px] font-medium text-zinc-400 font-mono-tabular tabular-nums truncate">
                        Nv. {tier.minLevel}–{tier.maxLevel} · {minXpRequired.toLocaleString('pt-BR')} XP
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold font-mono-tabular tabular-nums shrink-0 ${
                        isCurrent
                          ? 'text-orange-400'
                          : isUnlocked
                          ? 'text-emerald-400'
                          : 'text-zinc-500'
                      }`}
                    >
                      {isCurrent ? (
                        <>Atual</>
                      ) : isUnlocked ? (
                        <>
                          <Check size={18} strokeWidth={1.75} weight="regular" />
                          Conquistado
                        </>
                      ) : (
                        <>
                          <Lock size={18} strokeWidth={1.75} weight="regular" />
                          Dia ~{milestoneDay}
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                    {tier.description}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {MURIM_REALM_TIERS.map((realm) => {
              const isCurrent = dualProgression.murim.current.id === realm.id;
              const isUnlocked = dualProgression.murim.qiPoints >= realm.minQi;
              const milestoneDay = realm.order === 1 ? 1 : (realm.order - 1) * DAYS_PER_RANK_BASELINE;
              return (
                <div
                  key={realm.id}
                  className={`p-3 rounded-md border transition-colors ${
                    isCurrent
                      ? 'bg-[#111113] border-[#F97316]'
                      : isUnlocked
                      ? 'bg-[#111113] border-[#27272A]'
                      : 'bg-[#09090B] border-[#27272A] opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {realm.order}. {realm.name}
                      </div>
                      <div className="text-[11px] font-medium text-zinc-400 font-mono-tabular tabular-nums">
                        {realm.qiTechnique} · Dia ~{milestoneDay}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold font-mono-tabular tabular-nums shrink-0 ${
                        isCurrent
                          ? 'text-orange-400'
                          : isUnlocked
                          ? 'text-emerald-400'
                          : 'text-zinc-500'
                      }`}
                    >
                      {isCurrent ? (
                        <>Atual</>
                      ) : isUnlocked ? (
                        <>
                          <Check size={18} strokeWidth={1.75} weight="regular" />
                          {realm.minQi.toLocaleString('pt-BR')} Qi
                        </>
                      ) : (
                        <>
                          <Lock size={18} strokeWidth={1.75} weight="regular" />
                          {realm.minQi.toLocaleString('pt-BR')} Qi
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                    {realm.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Target size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            Matriz de atributos
          </h2>
          <span className="text-xs text-zinc-500 font-medium font-mono-tabular tabular-nums">
            Escala 10–100
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <AttributeRadarChart
            forca={attributes.forca}
            resistencia={attributes.resistencia}
            agilidade={attributes.agilidade}
            disciplina={attributes.disciplina}
          />

          <div className="space-y-3">
            {attributeList.map((attr) => (
              <div key={attr.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                    {attr.icon}
                    {attr.label}
                  </span>
                  <span className="font-bold text-white font-mono-tabular tabular-nums">
                    {attr.value}
                  </span>
                </div>
                <div className="w-full h-2 bg-[#111113] rounded-sm overflow-hidden border border-[#27272A]">
                  <div
                    className={`h-full rounded-sm transition-all duration-500 ${attr.barColor}`}
                    style={{ width: `${attr.value}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-500">{attr.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-bold text-white">Estatísticas gerais</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex justify-between">
              <span className="text-zinc-400">XP total</span>
              <span className="font-bold text-emerald-400 font-mono-tabular tabular-nums">
                {stats.totalXp.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex justify-between">
              <span className="text-zinc-400">Treinos</span>
              <span className="font-bold text-white font-mono-tabular tabular-nums">
                {stats.totalWorkouts}
              </span>
            </div>
            <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex justify-between">
              <span className="text-zinc-400">Chefes</span>
              <span className="font-bold text-white font-mono-tabular tabular-nums">
                {normalizedStats.bossesDefeated}
              </span>
            </div>
            <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex justify-between">
              <span className="text-zinc-400">Moedas</span>
              <span className="font-bold text-orange-400 font-mono-tabular tabular-nums">
                {normalizedStats.goldCoins.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex justify-between">
              <span className="text-zinc-400">Streak atual</span>
              <span className="font-bold text-orange-400 font-mono-tabular tabular-nums">
                {effectiveStreak}d
              </span>
            </div>
            <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex justify-between">
              <span className="text-zinc-400">Recorde</span>
              <span className="font-bold text-white font-mono-tabular tabular-nums">
                {stats.longestStreak}d
              </span>
            </div>
            <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex justify-between col-span-2">
              <span className="text-zinc-400">Recordes pessoais (PRs)</span>
              <span className="font-bold text-emerald-400 font-mono-tabular tabular-nums">
                {exercisePrsCount} exercício{exercisePrsCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </section>

        <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Vitrine de conquistas</h2>
            <span className="text-xs font-semibold text-orange-400 font-mono-tabular tabular-nums">
              {unlockedAchievements.length}/{ACHIEVEMENT_DEFINITIONS.length}
            </span>
          </div>
          {unlockedAchievements.length === 0 ? (
            <div className="p-4 rounded-md bg-[#111113] border border-[#27272A] text-left space-y-1">
              <p className="text-xs text-zinc-400">
                Complete treinos para exibir seus marcos aqui.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unlockedAchievements.map((ach) => (
                <div
                  key={ach.id}
                  className="px-3 py-2 rounded-md bg-[#111113] border border-emerald-500/40 flex items-center gap-2 text-xs font-semibold text-zinc-200"
                >
                  <AchievementGlyph id={ach.id} size={18} className="text-emerald-400" />
                  <span>{ach.title}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-4">
        <button
          type="button"
          onClick={() => void handleToggleTestsPanel()}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Flask size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
            <span className="text-xs font-semibold text-zinc-200">
              Verificação das regras RPG e zonas cardíacas
            </span>
          </div>
          <span
            className={`text-xs font-semibold font-mono-tabular tabular-nums ${
              allTestsPassed ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {loadingTests
              ? 'Executando...'
              : testResults
                ? `${testResults.filter((t) => t.passed).length}/${testResults.length} OK`
                : 'Executar diagnóstico'}
          </span>
        </button>

        {showTestsPanel && testResults && (
          <div className="mt-3 pt-3 border-t border-[#27272A] space-y-2">
            {testResults.map((t) => (
              <div
                key={t.name}
                className="p-2.5 rounded-md bg-[#111113] border border-[#27272A] text-xs flex items-start justify-between gap-2"
              >
                <span className="text-zinc-300 font-medium">{t.name}</span>
                <span
                  className={`font-semibold shrink-0 font-mono-tabular tabular-nums ${
                    t.passed ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {t.details}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2.5 pt-1">
        <PWAInstallButton className="w-full" />
        <div className="text-xs text-zinc-500">
          Conta conectada: {user.email ?? user.displayName ?? 'Usuário Google'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              setResetAcknowledged(false);
              setResetStep(1);
            }}
            className="min-h-[44px] py-2.5 px-4 rounded-md bg-[#18181B] hover:bg-red-500/10 border border-[#27272A] hover:border-red-500/40 text-red-400 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ArrowCounterClockwise size={18} strokeWidth={1.75} weight="regular" />
            Resetar progresso
          </button>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="min-h-[44px] py-2.5 px-4 rounded-md bg-[#18181B] hover:bg-zinc-800 border border-[#27272A] text-zinc-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <SignOut size={18} strokeWidth={1.75} weight="regular" />
            Sair da conta
          </button>
        </div>
      </section>

      {isEditing && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={(e) => void handleSaveEdit(e)}
            className="bg-[#18181B] border border-[#27272A] rounded-lg max-w-md w-full p-6 space-y-4 my-auto text-left"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Editar ficha e zonas FC</h3>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X size={18} strokeWidth={1.75} weight="regular" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Nome</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={24}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-md bg-[#111113] border border-[#27272A] focus:outline-none focus:border-orange-500 text-white text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Altura (cm)
                </label>
                <input
                  type="number"
                  min={100}
                  max={250}
                  placeholder="Ex: 180"
                  value={editHeightCm}
                  onChange={(e) => setEditHeightCm(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-[#111113] border border-[#27272A] focus:outline-none focus:border-orange-500 text-white placeholder-zinc-600 text-sm font-mono-tabular tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Peso (kg)
                </label>
                <input
                  type="number"
                  min={25}
                  max={350}
                  step="0.1"
                  placeholder="Ex: 108"
                  value={editWeightKg}
                  onChange={(e) => setEditWeightKg(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-[#111113] border border-[#27272A] focus:outline-none focus:border-orange-500 text-white placeholder-zinc-600 text-sm font-mono-tabular tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  FC repouso (bpm)
                </label>
                <input
                  type="number"
                  min={30}
                  max={120}
                  value={editRestingHr}
                  onChange={(e) => setEditRestingHr(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-[#111113] border border-[#27272A] focus:outline-none focus:border-orange-500 text-white text-sm font-mono-tabular tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  FC máxima (bpm)
                </label>
                <input
                  type="number"
                  min={120}
                  max={220}
                  value={editMaxHr}
                  onChange={(e) => setEditMaxHr(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-[#111113] border border-[#27272A] focus:outline-none focus:border-orange-500 text-white text-sm font-mono-tabular tabular-nums"
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-zinc-300 mb-1.5">Emblema</span>
              <div className="grid grid-cols-6 gap-2">
                {HERO_AVATARS.map((item) => {
                  const isSelected = editAvatar === item.emoji;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setEditAvatar(item.emoji)}
                      title={item.label}
                      aria-label={item.label}
                      className={`h-10 rounded-md flex items-center justify-center border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-orange-500/15 border-[#F97316] text-orange-400'
                          : 'bg-[#111113] border-[#27272A] text-zinc-400 hover:text-zinc-200'
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

            <div>
              <span className="block text-xs font-semibold text-zinc-300 mb-1.5">Classe</span>
              <div className="grid grid-cols-3 gap-2">
                {(['Guerreiro', 'Arqueiro', 'Mago'] as const).map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setEditClass(cls)}
                    className={`py-2 px-2 rounded-md text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                      editClass === cls
                        ? 'bg-[#F97316] text-zinc-950 border-[#F97316]'
                        : 'bg-[#111113] text-zinc-400 border-[#27272A] hover:text-zinc-200'
                    }`}
                  >
                    <HeroGlyph
                      avatarOrClass={cls}
                      size={18}
                      className={editClass === cls ? 'text-zinc-950' : 'text-zinc-400'}
                    />
                    <span>{cls}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-zinc-300 mb-1.5">Objetivo</span>
              <div className="grid grid-cols-3 gap-2">
                {(['Emagrecer', 'Condicionamento', 'Ambos'] as const).map((obj) => (
                  <button
                    key={obj}
                    type="button"
                    onClick={() => setEditObjective(obj)}
                    className={`py-2 rounded-md text-xs font-semibold border cursor-pointer ${
                      editObjective === obj
                        ? 'bg-[#F97316] text-zinc-950 border-[#F97316]'
                        : 'bg-[#111113] text-zinc-400 border-[#27272A]'
                    }`}
                  >
                    {obj}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-zinc-300 mb-1.5">Experiência</span>
              <div className="grid grid-cols-3 gap-2">
                {(['Iniciante', 'Intermediário', 'Avançado'] as const).map((exp) => (
                  <button
                    key={exp}
                    type="button"
                    onClick={() => setEditExperience(exp)}
                    className={`py-2 rounded-md text-xs font-semibold border cursor-pointer ${
                      editExperience === exp
                        ? 'bg-orange-500/15 text-orange-400 border-orange-500/45'
                        : 'bg-[#111113] text-zinc-400 border-[#27272A]'
                    }`}
                  >
                    {exp}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 py-2.5 rounded-md bg-[#111113] border border-[#27272A] text-zinc-300 font-semibold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="flex-1 py-2.5 rounded-md bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold text-xs cursor-pointer"
              >
                {savingEdit ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {resetStep > 0 && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-red-500/40 rounded-lg max-w-sm w-full p-6 space-y-4 text-left">
            <div className="flex items-center gap-2.5 text-red-400">
              <ShieldWarning size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
              <h3 className="text-lg font-bold text-white">
                {resetStep === 1 ? 'Resetar progresso? (1/2)' : 'Confirmação final (2/2)'}
              </h3>
            </div>

            {resetStep === 1 ? (
              <>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Você está prestes a apagar todo o histórico de <strong>{hero.name}</strong>: XP voltará a 0, Nível voltará a 1, streaks serão zerados e todas as atividades sincronizadas serão removidas.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setResetStep(0)}
                    className="flex-1 py-2.5 rounded-md bg-[#111113] border border-[#27272A] text-zinc-200 font-semibold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetStep(2)}
                    className="flex-1 py-2.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold text-xs cursor-pointer"
                  >
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="flex items-start gap-2.5 p-3 rounded-md bg-[#111113] border border-red-500/35 cursor-pointer text-xs text-red-300">
                  <input
                    type="checkbox"
                    checked={resetAcknowledged}
                    onChange={(e) => setResetAcknowledged(e.target.checked)}
                    className="mt-0.5 rounded accent-red-500"
                  />
                  <span>
                    Sim, entendo que esta ação é irreversível e apagará permanentemente todo meu progresso.
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => {
                      setResetStep(0);
                      setResetAcknowledged(false);
                    }}
                    className="flex-1 py-2.5 rounded-md bg-[#111113] border border-[#27272A] text-zinc-200 font-semibold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!resetAcknowledged || resetting}
                    onClick={() => void handleConfirmReset()}
                    className="flex-1 py-2.5 rounded-md bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold text-xs cursor-pointer"
                  >
                    {resetting ? 'Resetando...' : 'Zerar tudo'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
