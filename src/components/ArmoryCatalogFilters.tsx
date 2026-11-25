import { useId, useRef, useState, type ReactNode } from 'react';
import { CaretDown, MagnifyingGlass, SlidersHorizontal, X } from '@phosphor-icons/react';
import type { EquipmentSetId } from '../types/fitness';
import { EQUIPMENT_SETS } from '../utils/rpgLogic';

const RARITY_OPTIONS = ['Todos', 'Comum', 'Raro', 'Épico', 'Lendário'] as const;
const STATUS_OPTIONS = ['Todos', 'Equipado', 'Desbloqueados', 'Disponíveis', 'Bloqueados'] as const;
const SORT_OPTIONS = [
  { id: 'catalog', label: 'Ordem do catálogo' },
  { id: 'price', label: 'Menor preço' },
  { id: 'power', label: 'Maior poder' },
  { id: 'name', label: 'Nome A–Z' },
] as const;

type RarityFilter = typeof RARITY_OPTIONS[number];
type StatusFilter = typeof STATUS_OPTIONS[number];
type SetFilter = 'Todos' | EquipmentSetId;
export type CatalogSort = typeof SORT_OPTIONS[number]['id'];

export interface ArmoryFilters {
  rarity: RarityFilter;
  status: StatusFilter;
  set: SetFilter;
  query: string;
}

export const DEFAULT_ARMORY_FILTERS: ArmoryFilters = { rarity: 'Todos', status: 'Todos', set: 'Todos', query: '' };

const RARITY_DOTS: Record<Exclude<RarityFilter, 'Todos'>, string> = {
  Comum: 'bg-zinc-400',
  Raro: 'bg-sky-400',
  Épico: 'bg-purple-400',
  Lendário: 'bg-amber-400',
};

const SELECT_STYLE = 'min-h-11 w-full cursor-pointer appearance-none rounded-lg border border-zinc-700 bg-[#111113] py-2 pl-3 pr-8 text-sm text-zinc-100 hover:border-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400';
const HOVER_CARET = 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400';

interface Props {
  filters: ArmoryFilters;
  rarityCounts: Record<RarityFilter, number>;
  resultCount: number;
  sort: CatalogSort;
  onChange: (changes: Partial<ArmoryFilters>) => void;
  onSort: (sort: CatalogSort) => void;
  onReset: () => void;
}

function FilterChip({ selected, onClick, children }: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className="ui-press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 bg-[#111113] px-3 text-xs font-semibold text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 aria-pressed:border-orange-500/65 aria-pressed:bg-orange-500/12 aria-pressed:text-orange-300 lg:min-h-9"
    >
      {children}
    </button>
  );
}

export function ArmoryCatalogFilters({ filters, rarityCounts, resultCount, sort, onChange, onSort, onReset }: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const activeSet = EQUIPMENT_SETS.find((set) => set.id === filters.set);
  const activeFilters = [
    ...(filters.rarity !== 'Todos' ? [{ key: 'rarity', label: filters.rarity, clear: { rarity: 'Todos' as const } }] : []),
    ...(filters.status !== 'Todos' ? [{ key: 'status', label: filters.status, clear: { status: 'Todos' as const } }] : []),
    ...(activeSet ? [{ key: 'set', label: activeSet.name, clear: { set: 'Todos' as const } }] : []),
  ];

  return (
    <section aria-label="Busca e filtros do arsenal" className="overflow-hidden rounded-xl border border-zinc-800 bg-[#18181B]">
      <div className="space-y-3.5 p-3 sm:p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 lg:grid-cols-1">
          <div className="relative min-w-0">
            <MagnifyingGlass size={19} aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchRef}
              type="text"
              value={filters.query}
              onChange={(event) => onChange({ query: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && filters.query) onChange({ query: '' });
              }}
              aria-label="Buscar equipamento"
              placeholder="Buscar"
              className={`min-h-12 w-full rounded-lg border border-zinc-700 bg-[#111113] pl-11 text-base text-zinc-50 transition-colors placeholder:text-zinc-400 hover:border-zinc-500 focus:border-orange-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/35 sm:text-sm ${filters.query ? 'pr-11' : 'pr-3'}`}
            />
            {filters.query && (
              <button type="button" aria-label="Limpar busca"
                onClick={() => {
                  onChange({ query: '' });
                  searchRef.current?.focus();
                }}
                className="absolute inset-y-0 right-0 inline-flex min-w-11 cursor-pointer items-center justify-center rounded-lg text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-400">
                <X size={17} aria-hidden="true" />
              </button>
            )}
          </div>
          <button ref={toggleRef} type="button" aria-expanded={expanded} aria-controls={panelId}
            onClick={() => setExpanded((open) => !open)}
            className="ui-press flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-[#111113] px-2.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500 focus-visible:outline-2 focus-visible:outline-orange-400 aria-expanded:border-orange-500/65 aria-expanded:bg-orange-500/12 aria-expanded:text-orange-300 lg:hidden"
          >
            <SlidersHorizontal size={17} aria-hidden="true" /> Filtros
            {activeFilters.length > 0 && <span className="rounded-full bg-orange-500/18 px-1.5 text-orange-300">{activeFilters.length}</span>}
          </button>
        </div>

        {!expanded && activeFilters.length > 0 && (
          <div role="group" aria-label="Filtros ativos" className="flex flex-wrap gap-1.5 lg:hidden">
            {activeFilters.map(({ key, label, clear }) => (
              <button key={key} type="button" aria-label={`Remover filtro ${label}`} onClick={() => {
                onChange(clear);
                toggleRef.current?.focus();
              }}
                className="ui-press inline-flex min-h-9 max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-orange-500/35 bg-orange-500/10 px-2.5 text-xs text-orange-200 hover:border-orange-400 focus-visible:outline-2 focus-visible:outline-orange-400">
                <span className="truncate">{label}</span><X size={13} className="shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        <div id={panelId} className={`gap-4 border-t border-zinc-800 pt-3.5 xl:grid-cols-[minmax(0,1fr)_14rem] ${expanded ? 'ui-reveal grid' : 'hidden lg:grid'}`}>
          <div className="min-w-0 space-y-3">
            <div role="group" aria-label="Raridade" className="space-y-2">
              <p className="text-xs font-semibold text-zinc-300">Raridade</p>
              <div className="flex flex-wrap gap-1.5">
                {RARITY_OPTIONS.map((rarity) => (
                  <FilterChip key={rarity} selected={filters.rarity === rarity} onClick={() => onChange({ rarity })}>
                    {rarity !== 'Todos' && <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${RARITY_DOTS[rarity]}`} />}
                    {rarity}
                    <span className="rounded bg-white/6 px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums">{rarityCounts[rarity]}</span>
                  </FilterChip>
                ))}
              </div>
            </div>
            <div role="group" aria-label="Status" className="space-y-2">
              <p className="text-xs font-semibold text-zinc-300">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((status) => (
                  <FilterChip key={status} selected={filters.status === status} onClick={() => onChange({ status })}>{status}</FilterChip>
                ))}
              </div>
            </div>
          </div>
          <div className="grid min-w-0 content-start gap-3 sm:grid-cols-2 xl:grid-cols-1 xl:border-l xl:border-zinc-800 xl:pl-4">
            <label className="grid min-w-0 gap-2 text-xs font-semibold text-zinc-300">
              Conjunto
              <span className="relative min-w-0">
                <select value={filters.set} className={SELECT_STYLE} onChange={(event) => {
                  const option = EQUIPMENT_SETS.find((set) => set.id === event.target.value);
                  onChange({ set: option?.id ?? 'Todos' });
                }}>
                  <option value="Todos">Todos os conjuntos</option>
                  {EQUIPMENT_SETS.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
                </select>
                <CaretDown size={14} aria-hidden="true" className={HOVER_CARET} />
              </span>
            </label>
            <label className="grid min-w-0 gap-2 text-xs font-semibold text-zinc-300">
              Ordenar por
              <span className="relative min-w-0">
                <select value={sort} className={SELECT_STYLE} onChange={(event) => {
                  const option = SORT_OPTIONS.find(({ id }) => id === event.target.value);
                  if (option) onSort(option.id);
                }}>
                  {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                <CaretDown size={14} aria-hidden="true" className={HOVER_CARET} />
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-zinc-800 bg-[#141416] px-3 py-1 sm:px-4">
        <span role="status" className="text-xs font-medium tabular-nums text-zinc-300">
          {resultCount} {resultCount === 1 ? 'peça encontrada' : 'peças encontradas'}
        </span>
        {(activeFilters.length > 0 || filters.query) && (
          <button type="button" onClick={() => {
            onReset();
            searchRef.current?.focus();
          }}
            className="ui-press inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-orange-300 hover:bg-orange-500/10 focus-visible:outline-2 focus-visible:outline-orange-400">
            <X size={14} aria-hidden="true" /> Limpar filtros
          </button>
        )}
      </div>
    </section>
  );
}
