import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  Check,
  Coins,
  Crown,
  Diamond,
  Eye,
  Feather,
  Flame,
  Ghost,
  Lightning,
  Lock,
  MagicWand,
  Plus,
  Receipt,
  Shield,
  ShieldCheck,
  ShieldWarning,
  Sparkle,
  Stack,
  Sword,
  Trash,
  Wind,
  X,
} from '@phosphor-icons/react';
import { Tabs } from 'radix-ui';
import {
  EquipmentIconName,
  EquipmentItem,
  EquipmentRarity,
  EquipmentSetId,
  EquipmentSlot,
  EquippedGear,
  GameStats,
  GearLoadoutPreset,
  HeroProfile,
} from '../types/fitness';
import {
  ARSENAL_CONFIG,
  EQUIPMENT_CATALOG,
  EXAMPLE_LOADOUT_PRESETS,
  calculateGearBonusSummary,
  compareGearSummaries,
  getDualProgressionStatus,
  getEquipmentRequirementProgress,
  getEquipmentSetById,
  getFriendlyErrorMessage,
  isEquipmentMilestoneUnlocked,
  normalizeGameStats,
} from '../utils/rpgLogic';
import { ErrorBanner } from './HudPrimitives';
import { ArmorySetsPanel } from './ArmorySetsPanel';
import { ArmoryCatalogFilters, DEFAULT_ARMORY_FILTERS, type ArmoryFilters, type CatalogSort } from './ArmoryCatalogFilters';
import { ProgressLedgerPanel } from './ProgressLedgerPanel';
import { ShadowKnightSprite } from './ShadowKnightSprite';

interface ArmoryViewProps {
  hero: HeroProfile;
  stats: GameStats;
  onPurchaseAndEquip: (item: EquipmentItem) => Promise<void>;
  onEquipToggle: (slot: EquipmentSlot, itemId: string | null) => Promise<void>;
  onSaveLoadoutPreset: (name: string, gear: EquippedGear) => Promise<void>;
  onApplyLoadoutPreset: (preset: GearLoadoutPreset) => Promise<void>;
  onDeleteLoadoutPreset: (presetId: string) => Promise<void>;
}

type CatalogSection = 'equipamentos' | 'conjuntos' | 'extrato';

const EQUIPMENT_SORTERS: Record<Exclude<CatalogSort, 'catalog'>, (a: EquipmentItem, b: EquipmentItem) => number> = {
  price: (a, b) => a.priceCoins - b.priceCoins,
  power: (a, b) => b.powerScore - a.powerScore,
  name: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
};

const RARITY_TEXT_STYLES: Record<EquipmentRarity, string> = {
  Comum: 'text-zinc-300',
  Raro: 'text-sky-400',
  Épico: 'text-purple-400',
  Lendário: 'text-amber-400',
};

const renderEquipmentIcon = (
  iconName: EquipmentIconName,
  color?: string,
  size: number = 18
): React.ReactNode => {
  const style = color ? { color } : undefined;
  switch (iconName) {
    case 'Crown':
      return <Crown size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Eye':
      return <Eye size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Sparkles':
      return <Sparkle size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Flame':
      return <Flame size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Shield':
      return <Shield size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'ShieldAlert':
      return <ShieldWarning size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Coins':
      return <Coins size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'ShieldCheck':
      return <ShieldCheck size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Wind':
      return <Wind size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'BookOpen':
      return <BookOpen size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Gem':
      return <Diamond size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Feather':
      return <Feather size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Ghost':
      return <Ghost size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Sword':
    case 'Swords':
      return <Sword size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Wand2':
      return <MagicWand size={size} strokeWidth={1.75} weight="regular" style={style} />;
    case 'Zap':
      return <Lightning size={size} strokeWidth={1.75} weight="regular" style={style} />;
  }
};

const formatDelta = (value: number, suffix: string): string => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
};

const normalizeCatalogSearch = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const ArmoryView: React.FC<ArmoryViewProps> = ({
  hero,
  stats,
  onPurchaseAndEquip,
  onEquipToggle,
  onSaveLoadoutPreset,
  onApplyLoadoutPreset,
  onDeleteLoadoutPreset,
}) => {
  const normalized = useMemo(() => normalizeGameStats(stats), [stats]);
  const dualProgression = useMemo(() => getDualProgressionStatus(normalized), [normalized]);
  const [activeSlot, setActiveSlot] = useState<EquipmentSlot | 'Todos'>('armadura');
  const [filters, setFilters] = useState(DEFAULT_ARMORY_FILTERS);
  const [sort, setSort] = useState<CatalogSort>('catalog');
  const { rarity: rarityFilter, status: statusFilter, set: setFilter, query: searchQuery } = filters;
  const [catalogSection, setCatalogSection] = useState<CatalogSection>('equipamentos');
  const [selectedSetId, setSelectedSetId] = useState<EquipmentSetId>('viajante');
  const equipmentTab = useRef<HTMLButtonElement>(null);
  const collectionTab = useRef<HTMLButtonElement>(null);
  const ledgerTab = useRef<HTMLButtonElement>(null);
  const [tryOnItem, setTryOnItem] = useState<EquipmentItem | null>(null);
  const [tryOnPreset, setTryOnPreset] = useState<GearLoadoutPreset | null>(null);
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [itemFeedback, setItemFeedback] = useState<{
    itemId: string;
    message: string;
    isError: boolean;
  } | null>(null);

  const previewGear: EquippedGear = useMemo(() => {
    if (tryOnPreset) {
      return tryOnPreset.gear;
    }
    if (tryOnItem) {
      return {
        ...normalized.equippedGear,
        [tryOnItem.slot]: tryOnItem.id,
      };
    }
    return normalized.equippedGear;
  }, [normalized.equippedGear, tryOnItem, tryOnPreset]);

  const currentSummary = useMemo(
    () => calculateGearBonusSummary(normalized.equippedGear),
    [normalized.equippedGear]
  );

  const previewSummary = useMemo(
    () => calculateGearBonusSummary(previewGear),
    [previewGear]
  );

  const comparisonDeltas = useMemo(() => {
    if (tryOnPreset) {
      return compareGearSummaries(normalized.equippedGear, tryOnPreset.gear);
    }
    if (tryOnItem) {
      return compareGearSummaries(normalized.equippedGear, tryOnItem);
    }
    return null;
  }, [normalized.equippedGear, tryOnItem, tryOnPreset]);

  const equippedCount = useMemo(
    () => Object.values(normalized.equippedGear).filter((v) => Boolean(v)).length,
    [normalized.equippedGear]
  );

  const matchingItems = useMemo(() => {
    const normalizedQuery = normalizeCatalogSearch(searchQuery.trim());
    return EQUIPMENT_CATALOG.filter((item) => {
      if (activeSlot !== 'Todos' && item.slot !== activeSlot) return false;
      if (setFilter !== 'Todos' && item.setId !== setFilter) return false;
      if (normalizedQuery) {
        const setName = getEquipmentSetById(item.setId)?.name ?? '';
        const haystack = normalizeCatalogSearch(
          `${item.name} ${item.description} ${item.unlockRequirementLabel} ${item.rarity} ${setName}`
        );
        if (!haystack.includes(normalizedQuery)) return false;
      }

      if (statusFilter === 'Todos') return true;
      const isOwned = normalized.ownedEquipmentIds.includes(item.id);
      if (statusFilter === 'Equipado') return normalized.equippedGear[item.slot] === item.id;
      if (statusFilter === 'Desbloqueados') return isOwned;
      if (isOwned) return false;
      const canAcquire = isEquipmentMilestoneUnlocked(item, normalized) && normalized.goldCoins >= item.priceCoins;
      return statusFilter === 'Disponíveis' ? canAcquire : !canAcquire;
    });
  }, [activeSlot, statusFilter, setFilter, searchQuery, normalized]);

  const rarityCatalogCounts = useMemo<Record<ArmoryFilters['rarity'], number>>(() => {
    const counts: Record<ArmoryFilters['rarity'], number> = {
      Todos: matchingItems.length,
      Comum: 0,
      Raro: 0,
      Épico: 0,
      Lendário: 0,
    };
    for (const item of matchingItems) {
      counts[item.rarity] += 1;
    }
    return counts;
  }, [matchingItems]);
  const slotItems = useMemo(() => {
    const items = rarityFilter === 'Todos' ? matchingItems : matchingItems.filter((item) => item.rarity === rarityFilter);
    return sort === 'catalog' ? items : [...items].sort(EQUIPMENT_SORTERS[sort]);
  }, [matchingItems, rarityFilter, sort]);

  const updateFilters = (changes: Partial<ArmoryFilters>) => {
    setFilters((current) => ({ ...current, ...changes }));
    if (changes.set && changes.set !== 'Todos') {
      setActiveSlot('Todos');
      setSelectedSetId(changes.set);
    }
  };

  const viewSetPieces = (id: EquipmentSetId) => {
    setFilters({ ...DEFAULT_ARMORY_FILTERS, set: id });
    setActiveSlot('Todos');
    setCatalogSection('equipamentos');
    equipmentTab.current?.focus();
  };

  const offscreenFeedback = itemFeedback && (catalogSection !== 'equipamentos' || !slotItems.some((item) => item.id === itemFeedback.itemId))
    ? itemFeedback
    : null;
  const visibleError = errorMsg ?? (offscreenFeedback?.isError ? offscreenFeedback.message : null);
  const visibleSuccess = feedbackMsg ?? (offscreenFeedback && !offscreenFeedback.isError ? offscreenFeedback.message : null);

  const getPreviewItemForSlot = (slot: EquipmentSlot): EquipmentItem | null => {
    const id = previewGear[slot];
    if (!id) return null;
    return EQUIPMENT_CATALOG.find((i) => i.id === id) ?? null;
  };

  const handleBuyOrUnlock = async (item: EquipmentItem): Promise<void> => {
    if (busyId) return;
    setErrorMsg(null);
    setFeedbackMsg(null);
    setItemFeedback(null);
    setBusyId(item.id);
    try {
      await onPurchaseAndEquip(item);
      setTryOnItem(null);
      setTryOnPreset(null);
      setItemFeedback({
        itemId: item.id,
        message: item.priceCoins === 0 ? 'Resgate confirmado. Item equipado.' : 'Compra confirmada. Item equipado.',
        isError: false,
      });
    } catch (err: unknown) {
      setItemFeedback({ itemId: item.id, message: getFriendlyErrorMessage(err), isError: true });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleEquip = async (item: EquipmentItem): Promise<void> => {
    if (busyId) return;
    setErrorMsg(null);
    setFeedbackMsg(null);
    setItemFeedback(null);
    setBusyId(item.id);
    try {
      const isEquipped = normalized.equippedGear[item.slot] === item.id;
      await onEquipToggle(item.slot, isEquipped ? null : item.id);
      setTryOnItem(null);
      setTryOnPreset(null);
      setItemFeedback({
        itemId: item.id,
        message: isEquipped ? `${item.name} removido.` : `${item.name} equipado.`,
        isError: false,
      });
    } catch (err: unknown) {
      setItemFeedback({ itemId: item.id, message: getFriendlyErrorMessage(err), isError: true });
    } finally {
      setBusyId(null);
    }
  };

  const handleSavePreset = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);
    const trimmed = presetNameInput.trim();
    if (trimmed.length < 2) {
      setErrorMsg('Informe um nome de pelo menos 2 caracteres para o loadout.');
      return;
    }
    setSavingPreset(true);
    try {
      await onSaveLoadoutPreset(trimmed, normalized.equippedGear);
      setPresetNameInput('');
      setFeedbackMsg(`Loadout "${trimmed}" salvo na nuvem.`);
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setSavingPreset(false);
    }
  };

  const handleApplyPreset = async (preset: GearLoadoutPreset): Promise<void> => {
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusyId(preset.id);
    try {
      const ownedCount = ARSENAL_CONFIG.slots.filter((slot) => {
        const itemId = preset.gear[slot.id];
        return Boolean(itemId && normalized.ownedEquipmentIds.includes(itemId));
      }).length;
      if (ownedCount === 0) {
        setErrorMsg(
          `Você ainda não desbloqueou peças do modelo "${preset.name}". Use Simular para testar a build no palco.`
        );
        return;
      }
      await onApplyLoadoutPreset(preset);
      setTryOnItem(null);
      setTryOnPreset(null);
      setFeedbackMsg(
        ownedCount < 4
          ? `${ownedCount}/4 peças disponíveis de "${preset.name}" equipadas.`
          : `Loadout "${preset.name}" equipado.`
      );
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeletePreset = async (preset: GearLoadoutPreset): Promise<void> => {
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusyId(preset.id);
    try {
      await onDeleteLoadoutPreset(preset.id);
      setFeedbackMsg(`Loadout "${preset.name}" removido.`);
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const renderOrbitalPedestal = (
    slot: EquipmentSlot,
    slotLabel: string,
    fallbackIcon: EquipmentIconName
  ) => {
    const equippedItem = getPreviewItemForSlot(slot);
    const isSlotSelected = activeSlot === slot;
    const isBeingPreviewed =
      tryOnItem?.slot === slot || Boolean(tryOnPreset && equippedItem);

    const rarityHex = equippedItem
      ? ARSENAL_CONFIG.raridades[equippedItem.rarityKey].cor
      : '#71717A';

    return (
      <button
        key={slot}
        type="button"
        onClick={() => {
          setActiveSlot(slot);
          setCatalogSection('equipamentos');
        }}
        className={`w-full min-h-[72px] p-3 rounded-lg border text-left transition-colors flex items-center gap-3 cursor-pointer ${
          isBeingPreviewed
            ? 'bg-[#111113] border-emerald-500/55'
            : isSlotSelected
            ? 'bg-[#111113] border-[#F97316]'
            : 'bg-[#111113] border-[#27272A] hover:border-zinc-600'
        }`}
      >
        <div
          className="w-10 h-10 rounded-md border flex items-center justify-center shrink-0 bg-[#09090B]"
          style={{
            borderColor: equippedItem ? `${rarityHex}66` : '#27272A',
          }}
        >
          {renderEquipmentIcon(
            equippedItem ? equippedItem.iconName : fallbackIcon,
            equippedItem ? rarityHex : '#71717A',
            18
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {slotLabel}
            </span>
            {equippedItem && (
              <span
                className="text-[10px] font-semibold font-mono-tabular tabular-nums"
                style={{ color: rarityHex }}
              >
                {equippedItem.rarity} · {equippedItem.auraMultiplier.toFixed(2).replace(/\.00$/, '.0')}x
              </span>
            )}
          </div>
          <div className="text-xs sm:text-sm font-bold text-white truncate mt-0.5">
            {equippedItem ? equippedItem.name : 'Slot vazio'}
          </div>
          <div className="text-[11px] font-mono-tabular tabular-nums text-zinc-400 truncate">
            {equippedItem
              ? `+${equippedItem.xpBonusPercent}% XP · +${equippedItem.coinBonusPercent}% Moedas · +${equippedItem.bossDamageBonusPercent}% Chefe`
              : 'Toque para equipar'}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-left">
        <div className="space-y-1">
          <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-orange-400">
            Equipamento tático
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Shield size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            Arsenal · Caçadores e Murim
          </h1>
          <p className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
            {EQUIPMENT_CATALOG.length} peças catalogadas ({normalized.ownedEquipmentIds.length}/{EQUIPMENT_CATALOG.length} desbloqueadas) com bônus de XP, Moedas e dano em chefes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#18181B] border border-[#27272A]">
            <Sword size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            <span className="text-xs sm:text-sm font-bold text-white font-mono-tabular tabular-nums whitespace-nowrap">
              Poder {currentSummary.totalPowerScore}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#18181B] border border-[#27272A]">
            <Coins size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            <span className="text-xs sm:text-sm font-bold text-orange-400 font-mono-tabular tabular-nums whitespace-nowrap">
              {normalized.goldCoins.toLocaleString('pt-BR')} Moedas
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setCatalogSection('conjuntos');
              collectionTab.current?.focus();
            }}
            className="ui-press flex min-h-10 items-center gap-1.5 rounded-md border border-orange-500/45 bg-orange-500/10 px-3 text-xs font-semibold text-orange-300 hover:bg-orange-500/20 focus-visible:outline-2 focus-visible:outline-orange-400"
          >
            <Stack size={16} aria-hidden="true" /> Ver conjuntos
          </button>
          <button
            type="button"
            onClick={() => {
              setCatalogSection('extrato');
              ledgerTab.current?.focus();
            }}
            className="ui-press flex min-h-10 items-center gap-1.5 rounded-md border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-orange-400"
          >
            <Receipt size={16} aria-hidden="true" /> Ver extrato
          </button>
        </div>
      </div>

      <ErrorBanner message={visibleError} onDismiss={() => {
        if (errorMsg) setErrorMsg(null);
        else setItemFeedback(null);
      }} />

      {visibleSuccess && (
        <div
          role="status"
          className="p-3 rounded-md bg-[#18181B] border border-emerald-500/45 text-xs text-emerald-400 flex items-center justify-between gap-2"
        >
          <span className="font-semibold">{visibleSuccess}</span>
          <button
            type="button"
            onClick={() => {
              if (feedbackMsg) setFeedbackMsg(null);
              else setItemFeedback(null);
            }}
            aria-label="Fechar aviso"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
          >
            <X size={18} strokeWidth={1.75} weight="regular" />
          </button>
        </div>
      )}

      {/* Palco do Cavaleiro e Slots Equipados */}
      <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white">{hero.name}</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="font-mono-tabular tabular-nums text-zinc-300 font-semibold">
              {equippedCount}/4 slots ativos
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className={`font-semibold font-mono-tabular tabular-nums ${RARITY_TEXT_STYLES[previewSummary.dominantRarity]}`}>
              Aura {previewSummary.dominantRarity} ({previewSummary.auraMultiplier.toFixed(2).replace(/\.00$/, '.0')}x)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono-tabular tabular-nums text-zinc-400">
            <span style={{ color: dualProgression.hunter.current.accentHex }} className="font-semibold">
              {dualProgression.hunter.current.label}
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span style={{ color: dualProgression.murim.current.accentHex }} className="font-semibold">
              {dualProgression.murim.current.name} ({dualProgression.murim.qiPoints.toLocaleString('pt-BR')} Qi)
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="text-zinc-400">{normalized.bossesDefeated} chefes</span>
          </div>
        </div>

        {/* Palco 3 Zonas: Pedestais Esquerda · Herói Centro · Pedestais Direita */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5 order-2 lg:order-1">
            {renderOrbitalPedestal('elmo', 'Elmo', 'Crown')}
            {renderOrbitalPedestal('capa', 'Capa', 'Wind')}
          </div>

          <div className="order-1 grid place-items-center rounded-lg border border-zinc-700/70 bg-[#111113] bg-[radial-gradient(ellipse_at_50%_65%,#2a1d14,transparent_72%)] px-4 py-2 lg:order-2">
            <ShadowKnightSprite equippedGear={previewGear} size="2xl" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5 order-3">
            {renderOrbitalPedestal('armadura', 'Armadura', 'Shield')}
            {renderOrbitalPedestal('arma', 'Arma', 'Sword')}
          </div>
        </div>

        {/* Barra de Bônus Reais Ativos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-md bg-[#111113] border border-[#27272A] text-left">
          <div className="space-y-0.5">
            <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Lightning size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
              Bônus de XP
            </div>
            <div className="text-base sm:text-lg font-bold text-emerald-400 font-mono-tabular tabular-nums">
              +{previewSummary.xpBonusPercent}%
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Coins size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
              Bônus moedas
            </div>
            <div className="text-base sm:text-lg font-bold text-orange-400 font-mono-tabular tabular-nums">
              +{previewSummary.coinBonusPercent}%
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Sword size={18} strokeWidth={1.75} weight="regular" className="text-red-400" />
              Dano em chefes
            </div>
            <div className="text-base sm:text-lg font-bold text-red-400 font-mono-tabular tabular-nums">
              +{previewSummary.bossDamageBonusPercent}%
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Stack size={18} strokeWidth={1.75} weight="regular" className="text-zinc-300" />
              Poder total
            </div>
            <div className="text-base sm:text-lg font-bold text-white font-mono-tabular tabular-nums">
              {previewSummary.totalPowerScore} pts
            </div>
          </div>
        </div>

        {/* Sinergias de Conjuntos Temáticos */}
        {previewSummary.activeSets.length > 0 && (
          <div className="space-y-2">
            {previewSummary.activeSets.map(({ set, equippedCount: count, twoPieceActive, fourPieceActive }) => (
              <div
                key={set.id}
                className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ backgroundColor: set.themeColorHex }}
                  />
                  <span className="font-bold text-white">
                    {set.name}
                  </span>
                  <span className="font-mono-tabular tabular-nums font-semibold text-zinc-400">
                    · {count} {count === 1 ? 'equipada' : 'equipadas'}
                  </span>
                </div>

                <div className="text-[11px] font-semibold font-mono-tabular tabular-nums">
                  {fourPieceActive && set.fourPieceBonus ? (
                    <span className="text-orange-400">
                      Bônus de 4 peças · {set.fourPieceBonus.label}
                    </span>
                  ) : twoPieceActive ? (
                    <span className="text-emerald-400">
                      Bônus de 2 peças · {set.twoPieceBonus.label}
                    </span>
                  ) : (
                    <span className="text-zinc-400">
                      Bônus com 2 peças · {set.twoPieceBonus.label}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Barra Comparativa Inline ao Experimentar Item ou Simular Preset */}
        {(tryOnItem || tryOnPreset) && comparisonDeltas && (
          <div className="ui-reveal flex flex-wrap items-center justify-between gap-3 rounded-md border border-orange-500/45 bg-[#111113] p-3.5 text-left text-xs">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="text-zinc-200 font-medium truncate">
                {tryOnPreset ? (
                  <>
                    Simulando modelo: <strong className="text-white">{tryOnPreset.name}</strong>
                  </>
                ) : (
                  <>
                    Comparando prévia: <strong className="text-white">{tryOnItem?.name}</strong>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 font-mono-tabular tabular-nums font-semibold text-[11px]">
                <span
                  className={
                    comparisonDeltas.deltaXpPercent > 0
                      ? 'text-emerald-400'
                      : comparisonDeltas.deltaXpPercent < 0
                      ? 'text-red-400'
                      : 'text-zinc-400'
                  }
                >
                  XP: {formatDelta(comparisonDeltas.deltaXpPercent, '%')}
                </span>
                <span
                  className={
                    comparisonDeltas.deltaCoinPercent > 0
                      ? 'text-emerald-400'
                      : comparisonDeltas.deltaCoinPercent < 0
                      ? 'text-red-400'
                      : 'text-zinc-400'
                  }
                >
                  Moedas: {formatDelta(comparisonDeltas.deltaCoinPercent, '%')}
                </span>
                <span
                  className={
                    comparisonDeltas.deltaBossDamagePercent > 0
                      ? 'text-emerald-400'
                      : comparisonDeltas.deltaBossDamagePercent < 0
                      ? 'text-red-400'
                      : 'text-zinc-400'
                  }
                >
                  Chefe: {formatDelta(comparisonDeltas.deltaBossDamagePercent, '%')}
                </span>
                <span
                  className={
                    comparisonDeltas.deltaPowerScore > 0
                      ? 'text-emerald-400'
                      : comparisonDeltas.deltaPowerScore < 0
                      ? 'text-red-400'
                      : 'text-zinc-400'
                  }
                >
                  Poder: {formatDelta(comparisonDeltas.deltaPowerScore, '')}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setTryOnItem(null);
                setTryOnPreset(null);
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#18181B] border border-[#27272A] text-zinc-200 hover:text-white font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <X size={18} strokeWidth={1.75} weight="regular" />
              Limpar prévia
            </button>
          </div>
        )}
      </section>

      {/* Presets de Loadout (Modelos Rápidos + até 4 Salvos) */}
      <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 sm:p-5 space-y-4 text-left">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bookmark size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            <h2 className="text-sm font-bold text-white">
              Presets de loadout
            </h2>
            <span className="text-xs font-mono-tabular tabular-nums text-zinc-400">
              · {normalized.gearLoadouts.length}/{ARSENAL_CONFIG.maxPresets} salvos
            </span>
          </div>
          <span className="text-[11px] text-zinc-400">
            Simule arquétipos completos ou salve até 4 builds próprias
          </span>
        </div>

        {/* 3 Modelos Rápidos Sugeridos */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Modelos rápidos
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {EXAMPLE_LOADOUT_PRESETS.map((preset) => {
              const summary = calculateGearBonusSummary(preset.gear);
              const ownedCount = ARSENAL_CONFIG.slots.filter((slot) => {
                const itemId = preset.gear[slot.id];
                return Boolean(itemId && normalized.ownedEquipmentIds.includes(itemId));
              }).length;
              const isSimulating = tryOnPreset?.id === preset.id;
              const isCurrentGear =
                preset.gear.elmo === normalized.equippedGear.elmo &&
                preset.gear.armadura === normalized.equippedGear.armadura &&
                preset.gear.capa === normalized.equippedGear.capa &&
                preset.gear.arma === normalized.equippedGear.arma;

              return (
                <div
                  key={preset.id}
                  className={`p-3.5 rounded-md border flex flex-col justify-between gap-3 ${
                    isSimulating
                      ? 'bg-[#111113] border-emerald-500/55'
                      : isCurrentGear
                      ? 'bg-[#111113] border-orange-500/60'
                      : 'bg-[#111113] border-[#27272A]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white truncate">
                        {preset.name}
                      </span>
                      <span className="text-[11px] font-mono-tabular tabular-nums font-semibold text-zinc-400 shrink-0">
                        {ownedCount}/4 peças
                      </span>
                    </div>
                    <div className="text-[11px] font-mono-tabular tabular-nums text-zinc-400">
                      +{summary.xpBonusPercent}% XP · +{summary.coinBonusPercent}% Moedas · +{summary.bossDamageBonusPercent}% Chefe
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTryOnItem(null);
                        setTryOnPreset(isSimulating ? null : preset);
                      }}
                      className="flex-1 min-h-[38px] px-2.5 py-1.5 rounded-md bg-[#18181B] hover:bg-zinc-800 border border-[#27272A] text-zinc-200 font-semibold text-xs flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Eye size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                      {isSimulating ? 'Ocultar' : 'Simular'}
                    </button>

                    <button
                      type="button"
                      disabled={isCurrentGear || ownedCount === 0 || busyId === preset.id}
                      onClick={() => void handleApplyPreset(preset)}
                      className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-md font-semibold text-xs whitespace-nowrap transition-colors cursor-pointer ${
                        isCurrentGear
                          ? 'bg-[#10B981]/15 text-emerald-400 border border-emerald-500/40'
                          : 'bg-[#F97316] hover:bg-orange-400 disabled:bg-[#18181B] disabled:text-zinc-500 disabled:border disabled:border-[#27272A] text-zinc-950'
                      }`}
                    >
                      {isCurrentGear
                        ? 'Ativo'
                        : ownedCount === 4
                        ? 'Equipar build'
                        : `Equipar (${ownedCount}/4)`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Salvar Build Atual do Jogador */}
        <form onSubmit={(e) => void handleSavePreset(e)} className="flex flex-col sm:flex-row gap-2 pt-1">
          <input
            type="text"
            value={presetNameInput}
            onChange={(e) => setPresetNameInput(e.target.value)}
            maxLength={28}
            placeholder="Nome do loadout atual (ex: Meu Rush XP)"
            disabled={normalized.gearLoadouts.length >= ARSENAL_CONFIG.maxPresets || savingPreset}
            className="flex-1 min-h-[42px] px-3.5 rounded-md bg-[#111113] border border-[#27272A] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={normalized.gearLoadouts.length >= ARSENAL_CONFIG.maxPresets || savingPreset}
            className="min-h-[42px] px-4 py-2 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:bg-[#111113] disabled:border disabled:border-[#27272A] disabled:text-zinc-500 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Plus size={18} strokeWidth={1.75} weight="regular" />
            {savingPreset ? 'Salvando...' : 'Salvar loadout atual'}
          </button>
        </form>

        {normalized.gearLoadouts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {normalized.gearLoadouts.map((preset) => {
              const summary = calculateGearBonusSummary(preset.gear);
              const isCurrentGear =
                preset.gear.elmo === normalized.equippedGear.elmo &&
                preset.gear.armadura === normalized.equippedGear.armadura &&
                preset.gear.capa === normalized.equippedGear.capa &&
                preset.gear.arma === normalized.equippedGear.arma;

              return (
                <div
                  key={preset.id}
                  className={`p-3 rounded-md border flex flex-col justify-between gap-2.5 ${
                    isCurrentGear
                      ? 'bg-[#111113] border-orange-500/55'
                      : 'bg-[#111113] border-[#27272A]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {preset.name}
                      </div>
                      <div className="text-[11px] font-mono-tabular tabular-nums text-zinc-400 mt-0.5">
                        +{summary.xpBonusPercent}% XP · +{summary.bossDamageBonusPercent}% Chefe
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === preset.id}
                      onClick={() => void handleDeletePreset(preset)}
                      aria-label={`Remover loadout ${preset.name}`}
                      className="min-h-[34px] min-w-[34px] -mt-1 -mr-1 rounded-md flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash size={18} strokeWidth={1.75} weight="regular" />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isCurrentGear || busyId === preset.id}
                    onClick={() => void handleApplyPreset(preset)}
                    className={`w-full min-h-[36px] px-3 py-1.5 rounded-md font-semibold text-xs whitespace-nowrap transition-colors cursor-pointer ${
                      isCurrentGear
                        ? 'bg-[#10B981]/15 text-emerald-400 border border-emerald-500/40'
                        : 'bg-[#18181B] hover:bg-[#F97316] text-zinc-200 hover:text-zinc-950 border border-[#27272A]'
                    }`}
                  >
                    {isCurrentGear ? 'Loadout ativo' : 'Aplicar'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Tabs.Root
        value={catalogSection}
        onValueChange={(value) => setCatalogSection(value === 'conjuntos' || value === 'extrato' ? value : 'equipamentos')}
        className="space-y-3"
      >
        <Tabs.List aria-label="Seções do arsenal" className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-[#111113] p-1 sm:w-fit">
          <Tabs.Trigger
            ref={equipmentTab}
            value="equipamentos"
            className="ui-press flex min-h-10 items-center justify-center gap-1.5 rounded-md px-1 text-xs font-semibold text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 sm:px-5"
          >
            <Shield size={16} aria-hidden="true" className="hidden sm:block" /> Equipamentos
          </Tabs.Trigger>
          <Tabs.Trigger
            ref={collectionTab}
            value="conjuntos"
            className="ui-press flex min-h-10 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 sm:px-5"
          >
            <Stack size={16} aria-hidden="true" className="hidden sm:block" /> Conjuntos
          </Tabs.Trigger>
          <Tabs.Trigger
            ref={ledgerTab}
            value="extrato"
            className="ui-press flex min-h-10 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 sm:px-5"
          >
            <Receipt size={16} aria-hidden="true" className="hidden sm:block" /> Extrato
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="conjuntos">
          <ArmorySetsPanel
            stats={normalized}
            selectedId={selectedSetId}
            onSelect={setSelectedSetId}
            onViewPieces={viewSetPieces}
          />
        </Tabs.Content>
        <Tabs.Content value="extrato">
          <ProgressLedgerPanel statsRevision={normalized.updatedAt} />
        </Tabs.Content>
        <Tabs.Content value="equipamentos" className="space-y-3">
          {/* Abas de Categoria */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Tipo de equipamento">
            <button
              type="button"
              aria-pressed={activeSlot === 'Todos'}
              onClick={() => setActiveSlot('Todos')}
              className="ui-press col-span-2 min-h-11 rounded-md border border-[#27272A] bg-[#18181B] px-3 text-xs font-semibold text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-400 aria-pressed:border-orange-500 aria-pressed:bg-orange-500 aria-pressed:text-zinc-950 sm:col-span-1"
            >
              Todos os tipos
            </button>
            {ARSENAL_CONFIG.slots.map((slot) => {
              const isActive = activeSlot === slot.id;
              const slotCatalogCount = EQUIPMENT_CATALOG.filter((i) => i.slot === slot.id).length;
              const slotOwnedCount = EQUIPMENT_CATALOG.filter(
                (i) => i.slot === slot.id && normalized.ownedEquipmentIds.includes(i.id)
              ).length;

              return (
                <button
                  key={slot.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveSlot(slot.id)}
                  className={`ui-press min-h-[44px] px-3 py-2 rounded-md border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-orange-400 ${
                    isActive
                      ? 'bg-[#F97316] border-[#F97316] text-zinc-950'
                      : 'bg-[#18181B] border-[#27272A] text-zinc-300 hover:text-white'
                  }`}
                >
                  {renderEquipmentIcon(slot.icone, undefined, 18)}
                  <span>{slot.nome}</span>
                  <span className="font-mono-tabular tabular-nums text-[11px] opacity-80">
                    {slotOwnedCount}/{slotCatalogCount}
                  </span>
                </button>
              );
            })}
          </div>

          <ArmoryCatalogFilters
            filters={filters}
            rarityCounts={rarityCatalogCounts}
            resultCount={slotItems.length}
            sort={sort}
            onChange={updateFilters}
            onSort={setSort}
            onReset={() => setFilters(DEFAULT_ARMORY_FILTERS)}
          />

          {/* Lista de Itens Filtrada */}
          {slotItems.length === 0 ? (
            <div className="p-8 rounded-lg bg-[#18181B] border border-[#27272A] text-left space-y-3">
              <p className="text-sm font-semibold text-zinc-300">
                Nenhum equipamento encontrado nesta combinação de filtros.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {slotItems.map((item) => {
                const isOwned = normalized.ownedEquipmentIds.includes(item.id);
                const isEquipped = normalized.equippedGear[item.slot] === item.id;
                const isPreviewing = tryOnItem?.id === item.id;
                const reqProgress = getEquipmentRequirementProgress(item, normalized);
                const milestoneMet = reqProgress.met;
                const canAfford = normalized.goldCoins >= item.priceCoins;
                const canAcquire = milestoneMet && canAfford;
                const isBusy = busyId === item.id;
                const feedback = itemFeedback?.itemId === item.id ? itemFeedback : null;
                const itemSet = getEquipmentSetById(item.setId);
                const rarityHex = ARSENAL_CONFIG.raridades[item.rarityKey].cor;

                const equippedInSlot = normalized.equippedGear[item.slot]
                  ? EQUIPMENT_CATALOG.find((e) => e.id === normalized.equippedGear[item.slot]) ?? null
                  : null;
                const itemDelta = !isEquipped
                  ? compareGearSummaries(normalized.equippedGear, item)
                  : null;
                const currentSetStatus = itemSet
                  ? itemDelta?.current.activeSets.find((s) => s.set.id === itemSet.id)
                  : null;
                const previewSetStatus = itemSet
                  ? itemDelta?.preview.activeSets.find((s) => s.set.id === itemSet.id)
                  : null;
                const activatesFourPiece =
                  Boolean(previewSetStatus?.fourPieceActive) && !currentSetStatus?.fourPieceActive;
                const activatesTwoPiece =
                  Boolean(previewSetStatus?.twoPieceActive) && !currentSetStatus?.twoPieceActive;

                return (
                  <article
                    key={item.id}
                    className={`rounded-lg p-4 sm:p-5 border transition-colors flex flex-col justify-between space-y-4 text-left ${
                      isEquipped
                        ? 'bg-[#18181B] border-[#F97316]'
                        : isPreviewing
                        ? 'bg-[#18181B] border-emerald-500/55'
                        : 'bg-[#18181B] border-[#27272A] hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className="w-11 h-11 rounded-md border flex items-center justify-center shrink-0 bg-[#111113]"
                        style={{
                          borderColor: `${rarityHex}66`,
                        }}
                      >
                        {renderEquipmentIcon(item.iconName, rarityHex, 18)}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-sm sm:text-base font-bold text-white truncate">
                            {item.name}
                          </h2>
                          {isEquipped && (
                            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 shrink-0">
                              <Check size={18} strokeWidth={1.75} weight="regular" /> Equipado
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] font-medium text-zinc-400 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono-tabular tabular-nums" style={{ color: rarityHex }}>
                            {item.rarity} · Aura {item.auraMultiplier.toFixed(2).replace(/\.00$/, '.0')}x
                          </span>
                          {itemSet && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span style={{ color: itemSet.themeColorHex }}>
                                {itemSet.name}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular tabular-nums text-zinc-300">
                            Poder {item.powerScore}
                          </span>
                        </div>

                        <div className="text-[11px] font-semibold font-mono-tabular tabular-nums text-zinc-200">
                          {item.powerBonusLabel}
                        </div>

                        <p className="text-xs text-zinc-400 leading-relaxed pt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    {itemDelta && (
                      <div className="px-3 py-2 rounded-md bg-[#111113] border border-[#27272A] space-y-1 text-[11px]">
                        <div className="flex items-center justify-between gap-2 text-zinc-400">
                          <span className="truncate">
                            Comparação vs. <strong className="text-zinc-200">{equippedInSlot ? equippedInSlot.name : 'Slot vazio'}</strong>
                          </span>
                          {(activatesFourPiece || activatesTwoPiece) && (
                            <span className="font-semibold text-orange-400 whitespace-nowrap shrink-0">
                              {activatesFourPiece ? 'Ativa bônus de 4 peças' : 'Ativa bônus de 2 peças'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-tabular tabular-nums font-semibold">
                          <span
                            className={
                              itemDelta.deltaXpPercent > 0
                                ? 'text-emerald-400'
                                : itemDelta.deltaXpPercent < 0
                                ? 'text-red-400'
                                : 'text-zinc-400'
                            }
                          >
                            XP {formatDelta(itemDelta.deltaXpPercent, '%')}
                          </span>
                          <span
                            className={
                              itemDelta.deltaCoinPercent > 0
                                ? 'text-emerald-400'
                                : itemDelta.deltaCoinPercent < 0
                                ? 'text-red-400'
                                : 'text-zinc-400'
                            }
                          >
                            Moedas {formatDelta(itemDelta.deltaCoinPercent, '%')}
                          </span>
                          <span
                            className={
                              itemDelta.deltaBossDamagePercent > 0
                                ? 'text-emerald-400'
                                : itemDelta.deltaBossDamagePercent < 0
                                ? 'text-red-400'
                                : 'text-zinc-400'
                            }
                          >
                            Chefe {formatDelta(itemDelta.deltaBossDamagePercent, '%')}
                          </span>
                          <span
                            className={
                              itemDelta.deltaPowerScore > 0
                                ? 'text-emerald-400'
                                : itemDelta.deltaPowerScore < 0
                                ? 'text-red-400'
                                : 'text-zinc-400'
                            }
                          >
                            Poder {formatDelta(itemDelta.deltaPowerScore, '')}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#27272A]">
                      <div className="text-xs font-medium font-mono-tabular tabular-nums space-y-0.5">
                        {isOwned ? (
                          <span className="text-emerald-400 font-semibold">Desbloqueado</span>
                        ) : (
                          <>
                            <div className={canAcquire ? 'text-orange-400 font-semibold' : 'text-zinc-300'}>
                              {item.unlockRequirementLabel}
                            </div>
                            {!milestoneMet && (
                              <div className="text-[11px] text-zinc-400">
                                Progresso: {reqProgress.progressText}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!isEquipped && (
                          <button
                            type="button"
                            aria-expanded={isPreviewing}
                            aria-controls={isPreviewing ? `equipment-preview-${item.id}` : undefined}
                            onClick={() => {
                              setTryOnPreset(null);
                              setTryOnItem(isPreviewing ? null : item);
                            }}
                            className="ui-press flex min-h-[38px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-800 bg-[#111113] px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 aria-expanded:border-orange-500/45 aria-expanded:text-orange-300"
                          >
                            <Eye size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                            {isPreviewing ? 'Ocultar' : 'Experimentar'}
                          </button>
                        )}

                        {isOwned ? (
                          <button
                            type="button"
                            disabled={busyId !== null}
                            aria-busy={isBusy}
                            onClick={() => void handleToggleEquip(item)}
                            className={`min-h-[38px] px-3.5 py-1.5 rounded-md font-semibold text-xs whitespace-nowrap transition-colors cursor-pointer ${
                              isEquipped
                                ? 'bg-[#111113] border border-[#27272A] text-zinc-300 hover:text-white'
                                : 'bg-[#F97316] hover:bg-orange-400 text-zinc-950'
                            }`}
                          >
                            {isBusy ? 'Salvando…' : isEquipped ? 'Desequipar' : 'Equipar'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canAcquire || busyId !== null}
                            aria-busy={isBusy}
                            aria-label={canAcquire && !isBusy && item.priceCoins > 0 ? `Comprar ${item.name} por ${item.priceCoins.toLocaleString('pt-BR')} moedas` : undefined}
                            onClick={() => void handleBuyOrUnlock(item)}
                            className="min-h-[38px] px-3.5 py-1.5 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:bg-[#111113] disabled:border disabled:border-[#27272A] disabled:text-zinc-500 text-zinc-950 font-semibold font-mono-tabular tabular-nums text-xs flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                          >
                            {isBusy ? 'Comprando…' : !milestoneMet ? (
                              <>
                                <Lock size={18} strokeWidth={1.75} weight="regular" /> Bloqueado
                              </>
                            ) : !canAfford ? (
                              'Saldo insuficiente'
                            ) : item.priceCoins === 0 ? (
                              <>
                                <Sparkle size={18} strokeWidth={1.75} weight="regular" /> Resgatar
                              </>
                            ) : (
                              <>
                                Comprar <Coins size={16} strokeWidth={1.75} weight="regular" aria-hidden="true" /> {item.priceCoins.toLocaleString('pt-BR')}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    {feedback && (feedback.isError ? (
                      <ErrorBanner message={feedback.message} onDismiss={() => setItemFeedback(null)} />
                    ) : (
                      <p role="status" className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-950/30 p-2.5 text-xs font-medium text-emerald-300">
                        <Check size={16} aria-hidden="true" /> {feedback.message}
                      </p>
                    ))}
                    {isPreviewing && (
                      <div
                        id={`equipment-preview-${item.id}`}
                        role="group"
                        aria-label="Prévia no Cavaleiro"
                        className="ui-reveal grid place-items-center rounded-lg border border-zinc-800 bg-[#111113] bg-[radial-gradient(ellipse_at_50%_65%,#2a1d14,transparent_72%)]"
                      >
                        <ShadowKnightSprite equippedGear={previewGear} size="lg" />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
};
