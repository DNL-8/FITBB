import { ArrowRight, Check, Lightning } from '@phosphor-icons/react';
import type { EquipmentSetId, EquippedGear } from '../types/fitness';
import {
  ARSENAL_CONFIG,
  EQUIPMENT_CATALOG,
  EQUIPMENT_SETS,
  normalizeGameStats,
} from '../utils/rpgLogic';
import { ShadowKnightSprite } from './ShadowKnightSprite';

const collections = EQUIPMENT_SETS.map((set) => ({
  set,
  slots: ARSENAL_CONFIG.slots.map((slot) => ({
    ...slot,
    items: EQUIPMENT_CATALOG.filter((item) => item.setId === set.id && item.slot === slot.id),
  })).filter(({ items }) => items.length > 0),
}));

interface ArmorySetsPanelProps {
  stats: ReturnType<typeof normalizeGameStats>;
  selectedId: EquipmentSetId;
  onSelect: (id: EquipmentSetId) => void;
  onViewPieces: (id: EquipmentSetId) => void;
}

export function ArmorySetsPanel({ stats, selectedId, onSelect, onViewPieces }: ArmorySetsPanelProps) {
  const selected = collections.find(({ set }) => set.id === selectedId) ?? collections[0];
  const { set, slots } = selected;
  const ownedIds = new Set(stats.ownedEquipmentIds);
  const pieces = slots.map(({ id, nome, items }) => {
    const equipped = items.find((item) => item.id === stats.equippedGear[id]);
    const owned = items.find((item) => ownedIds.has(item.id));
    return { id, nome, item: equipped ?? owned ?? items[0], equipped: Boolean(equipped), owned: Boolean(owned), options: items.length };
  });
  const equippedCount = pieces.filter(({ equipped }) => equipped).length;
  const ownedCount = pieces.filter(({ owned }) => owned).length;
  const previewGear: EquippedGear = { elmo: null, armadura: null, capa: null, arma: null };
  for (const { id, item } of pieces) previewGear[id] = item.id;

  const bonuses = [{ required: 2, label: set.twoPieceBonus.label }];
  if (set.fourPieceBonus && slots.length >= 4) {
    bonuses.push({ required: 4, label: set.fourPieceBonus.label });
  }
  const activeBonus = bonuses.filter(({ required }) => equippedCount >= required).at(-1)?.required;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <label className="grid gap-1.5 text-xs font-medium text-zinc-300 lg:hidden">
        Escolher conjunto
        <select
          value={set.id}
          onChange={(event) => {
            const option = EQUIPMENT_SETS.find(({ id }) => id === event.target.value);
            if (option) onSelect(option.id);
          }}
          className="min-h-11 w-full rounded-md border border-zinc-700 bg-[#151518] px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-orange-400"
        >
          {EQUIPMENT_SETS.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      <div role="group" aria-label="Escolher conjunto" className="hidden content-start gap-2 lg:grid">
        {collections.map(({ set: option, slots: optionSlots }) => {
          const acquired = optionSlots.filter(({ items }) => items.some(({ id }) => ownedIds.has(id))).length;
          return (
            <button
              type="button"
              key={option.id}
              aria-pressed={option.id === set.id}
              onClick={() => onSelect(option.id)}
              className="ui-press flex min-h-14 min-w-0 cursor-pointer flex-col items-start justify-center gap-1 rounded-lg border border-zinc-800 bg-[#151518] px-2.5 py-2 text-left hover:border-zinc-600 focus-visible:outline-2 focus-visible:outline-orange-400 aria-pressed:border-orange-500/60 aria-pressed:bg-orange-500/10 sm:px-3"
            >
              <span className="flex min-w-0 items-start gap-2 text-xs font-semibold text-zinc-100">
                <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: option.themeColorHex }} />
                {option.name}
              </span>
              <span className="pl-4 text-xs tabular-nums text-zinc-400">{acquired}/{optionSlots.length} obtidas</span>
            </button>
          );
        })}
      </div>

      <article key={set.id} className="ui-reveal min-w-0 space-y-4 rounded-xl border border-zinc-800 bg-[#151518] p-3.5 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-zinc-50">{set.name}</h2>
            <p className="mt-0.5 text-xs text-zinc-400">{set.description}</p>
          </div>
          <button
            type="button"
            onClick={() => onViewPieces(set.id)}
            className="ui-press inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-orange-500/45 bg-orange-500/10 px-3 text-xs font-semibold text-orange-300 hover:bg-orange-500/20 focus-visible:outline-2 focus-visible:outline-orange-400"
          >
            Ver peças no catálogo <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
          <div
            role="group"
            aria-label="Prévia do conjunto"
            className="grid min-w-0 place-items-center rounded-lg border border-zinc-800 bg-[#111113] p-2"
          >
            <ShadowKnightSprite equippedGear={previewGear} size="xl" />
          </div>
          <div className="min-w-0 rounded-lg border border-zinc-800 bg-[#111113] p-3">
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium tabular-nums">
              <span className="text-zinc-200">{ownedCount}/{slots.length} peças obtidas</span>
              <span className="text-zinc-400">{equippedCount}/{slots.length} equipadas</span>
            </p>
            <ul className="mt-1.5 divide-y divide-zinc-800">
              {pieces.map(({ id, nome, item, equipped, owned, options }) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="block text-[11px] text-zinc-400">
                      {nome}{options > 1 ? ` · ${options} opções` : ''}
                    </span>
                    <span className="font-medium text-zinc-100">{item.name}</span>
                  </span>
                  <span className={equipped ? 'text-emerald-300' : 'text-zinc-400'}>
                    {equipped ? 'Equipada' : owned ? 'Obtida' : 'A obter'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <dl className="grid gap-2 sm:grid-cols-2">
          {bonuses.map(({ required, label }) => (
            <div
              key={required}
              className={`rounded-lg border p-3 ${required === activeBonus ? 'border-emerald-500/35 bg-emerald-500/8' : 'border-zinc-800 bg-[#111113]'}`}
            >
              <dt className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-zinc-100">
                <span className="inline-flex items-center gap-1.5">
                  <Lightning size={16} className="text-orange-300" aria-hidden="true" /> {required} peças
                </span>
                {required === activeBonus && (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <Check size={14} aria-hidden="true" /> Ativo
                  </span>
                )}
              </dt>
              <dd className="mt-1 text-xs tabular-nums text-zinc-300">{label}</dd>
            </div>
          ))}
        </dl>
      </article>
    </div>
  );
}
