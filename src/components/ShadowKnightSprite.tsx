import React from 'react';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import murimMascotUrl from '../assets/mascote_murim_cavaleiro_robo_completo.svg?no-inline';
import { EquippedGear } from '../types/fitness';
import {
  ARSENAL_CONFIG,
  DEFAULT_EQUIPPED_GEAR,
  EQUIPMENT_CATALOG,
  calculateGearBonusSummary,
  migrateEquippedGear,
} from '../utils/rpgLogic';

const bladeOutlines: Partial<Record<string, string>> = {
  arma_adaga_mercador: 'M0 -34 L5.5 -13 L3.5 -10 H-4.5 L-5.5 -13 Z',
  arma_faca_incursao_f: 'M0 -35 L5.5 -24 L4 -10 H-5 L-5.5 -26 Z',
  arma_presas_monarca: 'M1 -49 Q10 -31 5 -10 H-4 Q-1 -32 1 -49 Z',
};

// Normaliza a cena quadrada do SVG enviado para as coordenadas dos equipamentos.
const murimArtworkTransform = 'scale(0.244897959) translate(-95 -30)';

interface ShadowKnightSpriteProps {
  equippedGear?: EquippedGear;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  attackId?: number;
  isCelebrating?: boolean;
  className?: string;
}

export const ShadowKnightSprite: React.FC<ShadowKnightSpriteProps> = ({
  equippedGear = DEFAULT_EQUIPPED_GEAR,
  size = 'md',
  attackId = 0,
  isCelebrating = false,
  className = '',
}) => {
  const reduceMotion = useReducedMotion();
  const [spriteScope, animateSprite] = useAnimate<HTMLDivElement>();
  const armRef = React.useRef<SVGGElement>(null);

  React.useEffect(() => {
    const sprite = spriteScope.current;
    const arm = armRef.current;
    if (!sprite || !arm) return;
    if (reduceMotion) {
      animateSprite([
        [sprite, { x: 0, scale: 1 }, { duration: 0 }],
        [arm, { rotate: 0 }, { duration: 0 }],
      ]);
      return;
    }
    if (!attackId) return;

    const timing = { duration: 0.38, times: [0, 0.2, 0.53, 1] };
    const strike = animateSprite([
      [sprite, { x: [null, -3, 10, 0], scale: [null, 0.99, 1.045, 1] }, timing],
      [arm, { rotate: [null, -11, 31, 0] }, { ...timing, at: 0 }],
    ]);
    return () => strike.stop();
  }, [animateSprite, attackId, reduceMotion, spriteScope]);

  const safeGear = migrateEquippedGear(equippedGear);
  const helmItem = EQUIPMENT_CATALOG.find((i) => i.id === safeGear.elmo) ?? null;
  const armorItem = EQUIPMENT_CATALOG.find((i) => i.id === safeGear.armadura) ?? null;
  const capeItem = EQUIPMENT_CATALOG.find((i) => i.id === safeGear.capa) ?? null;
  const weaponItem = EQUIPMENT_CATALOG.find((i) => i.id === safeGear.arma) ?? null;
  const spriteId = React.useId();
  const auraId = `${spriteId}-aura`;
  const eyeColor = helmItem?.id === 'elmo_presa_carmesim'
    ? '#FDA4AF'
    : helmItem?.id === 'elmo_monarca'
      ? '#FDE047'
      : helmItem && (helmItem.rarity === 'Épico' || helmItem.rarity === 'Lendário')
        ? helmItem.secondaryHex
        : undefined;
  const showScene = size === '2xl';

  const weaponId = weaponItem?.id ?? '';
  const isStaff = weaponId === 'arma_cajado_abissal';
  const usesPole = isStaff || weaponId.startsWith('arma_lanca_');
  const isTrainingSword = weaponId === 'arma_bastao_treino';
  const bladeOutline = bladeOutlines[weaponId] ?? (
    weaponItem?.iconName === 'Swords'
      ? 'M2 -46 Q9 -31 5 -10 H-5 Q-2 -31 2 -46 Z'
      : 'M0 -46 L6 -33 L5 -10 H-5 L-6 -33 Z'
  );

  const bonusSummary = calculateGearBonusSummary(safeGear);
  const activeFourPiece = bonusSummary.activeSets.find((s) => s.fourPieceActive);
  const activeTwoPiece = bonusSummary.activeSets.find((s) => s.twoPieceActive);

  const sizeClass =
    size === 'sm'
      ? 'w-12 h-12'
      : size === 'md'
      ? 'w-16 h-16'
      : size === 'lg'
      ? 'w-24 h-24'
      : size === 'xl'
      ? 'w-32 h-32'
      : 'w-44 h-44 sm:w-52 sm:h-52';

  const rarityConfig = ARSENAL_CONFIG.raridades[bonusSummary.dominantRarityKey];
  const auraHex = activeFourPiece
    ? activeFourPiece.set.themeColorHex
    : rarityConfig?.cor ?? '#a1a1aa';

  const auraMultiplier = bonusSummary.auraMultiplier;
  const auraOpacity = Math.min(0.42, 0.16 * auraMultiplier).toFixed(2);
  const haloRadius = Math.round(36 + auraMultiplier * 5);
  const hasEnhancedAura = auraMultiplier >= 1.25 || Boolean(activeTwoPiece);

  return (
    <motion.div
      ref={spriteScope}
      initial={false}
      animate={isCelebrating && !reduceMotion ? { y: [0, -7, 0], scale: [1, 1.05, 1] } : undefined}
      transition={{ duration: 0.52, ease: 'easeOut' }}
      className={`relative inline-flex items-center justify-center select-none ${sizeClass} ${className}`}
    >
      <svg
        viewBox={showScene ? '0 0 120 120' : '8 5 104 106'}
        className={`w-full h-full overflow-visible ${size === 'sm' ? '' : 'ui-sprite-idle'}`}
        role="img"
        aria-label="Avatar Cavaleiro das Sombras"
      >
        <defs>
          <radialGradient id={auraId} cx="50%" cy="55%" r="50%">
            <stop offset="0%" stopColor={auraHex} stopOpacity={auraOpacity} />
            <stop offset="100%" stopColor="#09090B" stopOpacity="0" />
          </radialGradient>
        </defs>

        {showScene && (
          <use href={`${murimMascotUrl}#scene`} transform={murimArtworkTransform} />
        )}

        {hasEnhancedAura && (
          <circle cx="60" cy="60" r={haloRadius} fill={`url(#${auraId})`} />
        )}
        {(activeTwoPiece || activeFourPiece || auraMultiplier >= 1.5) && (
          <ellipse
            cx="60"
            cy="107"
            rx={activeFourPiece ? 40 : 32}
            ry={activeFourPiece ? 9 : 7}
            fill="none"
            stroke={auraHex}
            strokeWidth={activeFourPiece || auraMultiplier >= 2.0 ? '1.6' : '1.1'}
            strokeDasharray={activeFourPiece ? undefined : '4 3'}
            opacity="0.68"
          />
        )}

        {/* CAPA (camada traseira) */}
        {capeItem && (
          <g key={capeItem.id} className="ui-preview-piece">
            {capeItem.id === 'capa_monarca' ? (
              <>
                <path
                  d="M 42 52 Q 8 32 14 76 Q 27 72 40 84 Z"
                  fill={capeItem.accentHex}
                  opacity="0.9"
                  stroke={capeItem.secondaryHex}
                  strokeWidth="2"
                />
                <path
                  d="M 78 52 Q 112 32 106 76 Q 93 72 80 84 Z"
                  fill={capeItem.accentHex}
                  opacity="0.9"
                  stroke={capeItem.secondaryHex}
                  strokeWidth="2"
                />
                <path
                  d="M 38 50 L 24 98 Q 60 107 96 98 L 82 50 Z"
                  fill="#111113"
                  opacity="0.9"
                  stroke={capeItem.secondaryHex}
                  strokeWidth="1.6"
                />
              </>
            ) : capeItem.id === 'capa_asa_carmesim' ? (
              <>
                <path
                  d="M 40 50 L 12 38 L 19 66 L 28 74 L 38 82 Z"
                  fill={capeItem.accentHex}
                  opacity="0.9"
                  stroke={capeItem.secondaryHex}
                  strokeWidth="1.8"
                />
                <path
                  d="M 80 50 L 108 38 L 101 66 L 92 74 L 82 82 Z"
                  fill={capeItem.accentHex}
                  opacity="0.9"
                  stroke={capeItem.secondaryHex}
                  strokeWidth="1.8"
                />
              </>
            ) : capeItem.id === 'capa_mercador_sombrio' ? (
              <>
                <path
                  d="M 36 48 L 16 98 Q 60 107 104 98 L 84 48 Z"
                  fill={capeItem.accentHex}
                  opacity="0.88"
                  stroke={capeItem.secondaryHex}
                  strokeWidth="2.4"
                />
                <circle
                  cx="60"
                  cy="93"
                  r="4.5"
                  fill={capeItem.secondaryHex}
                  opacity="0.92"
                />
              </>
            ) : capeItem.id === 'capa_sabio_astral' ? (
              <>
                <path
                  d="M 37 49 L 20 96 Q 60 104 100 96 L 83 49 Z"
                  fill={capeItem.accentHex}
                  opacity="0.88"
                  stroke={capeItem.secondaryHex}
                  strokeWidth="2"
                />
                <circle cx="29" cy="84" r="2.2" fill="#FB923C" />
                <circle cx="91" cy="84" r="2.2" fill="#FB923C" />
              </>
            ) : (
              <>
                <path
                  d="M 38 50 L 22 96 Q 60 105 98 96 L 82 50 Z"
                  fill={capeItem.accentHex}
                  opacity="0.88"
                  stroke={capeItem.secondaryHex}
                  strokeWidth={capeItem.rarity === 'Lendário' || capeItem.rarity === 'Épico' ? '2.2' : '1.8'}
                />
                {(capeItem.rarity === 'Épico' || capeItem.rarity === 'Lendário') && (
                  <>
                    <path
                      d="M 34 62 L 26 92"
                      fill="none"
                      stroke={capeItem.secondaryHex}
                      strokeWidth="1.4"
                      opacity="0.7"
                    />
                    <path
                      d="M 86 62 L 94 92"
                      fill="none"
                      stroke={capeItem.secondaryHex}
                      strokeWidth="1.4"
                      opacity="0.7"
                    />
                  </>
                )}
              </>
            )}
          </g>
        )}

        <g transform={murimArtworkTransform}>
          <use href={`${murimMascotUrl}#shadow`} />
          <use href={`${murimMascotUrl}#qi`} />
          <use href={`${murimMascotUrl}#body`} />
        </g>

        {/* ARMADURA EQUIPADA */}
        {armorItem && (
          <g key={armorItem.id} className="ui-preview-piece">
            <rect
              x="43"
              y="51"
              width="34"
              height="29"
              rx="8"
              fill={armorItem.accentHex}
              stroke={armorItem.secondaryHex}
              strokeWidth="1.6"
            />
            {/* Ombreiras */}
            <path
              d={
                armorItem.id === 'armadura_couraca_rubra' ||
                armorItem.id === 'armadura_monarca' ||
                armorItem.rarity === 'Lendário' ||
                armorItem.rarity === 'Épico'
                  ? 'M 22 54 L 34 42 L 45 53 L 40 66 Q 27 66 22 54 Z'
                  : 'M 27 56 Q 35 45 45 53 L 40 66 Q 30 66 27 56 Z'
              }
              fill={armorItem.accentHex}
              stroke={armorItem.secondaryHex}
              strokeWidth="1.8"
            />
            <path
              d={
                armorItem.id === 'armadura_couraca_rubra' ||
                armorItem.id === 'armadura_monarca' ||
                armorItem.rarity === 'Lendário' ||
                armorItem.rarity === 'Épico'
                  ? 'M 98 54 L 86 42 L 75 53 L 80 66 Q 93 66 98 54 Z'
                  : 'M 93 56 Q 85 45 75 53 L 80 66 Q 90 66 93 56 Z'
              }
              fill={armorItem.accentHex}
              stroke={armorItem.secondaryHex}
              strokeWidth="1.8"
            />
            {/* Detalhes peitorais específicos */}
            {armorItem.id === 'armadura_monarca' ? (
              <>
                <circle cx="60" cy="65" r="7.5" fill="#09090B" stroke="#FBBF24" strokeWidth="2" />
                <polygon points="60,59 64.5,65 60,71 55.5,65" fill="#F97316" />
              </>
            ) : armorItem.id === 'armadura_manto_alquimista' ? (
              <>
                <circle cx="60" cy="65" r="6.5" fill="#27272A" stroke="#EAB308" strokeWidth="2" />
                <circle cx="60" cy="65" r="3" fill="#FACC15" />
              </>
            ) : armorItem.id === 'armadura_couraca_rubra' ? (
              <>
                <path d="M 48 60 L 60 74 L 72 60" fill="none" stroke={armorItem.secondaryHex} strokeWidth="2.2" />
                <polygon points="60,61 65,67 60,73 55,67" fill="#FBBF24" />
              </>
            ) : (
              <polygon
                points="60,59 68,68 60,77 52,68"
                fill={armorItem.secondaryHex}
                stroke="#09090B"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}

        <g transform={murimArtworkTransform}>
          <use href={`${murimMascotUrl}#belt`} />
          {!armorItem && <use href={`${murimMascotUrl}#shoulders`} />}
        </g>

        {/* A arma e a mão giram juntas, usando o ombro do novo desenho como pivô. */}
        <g ref={armRef} style={{ transformOrigin: '79px 58px', transformBox: 'view-box' }}>
          <use href={`${murimMascotUrl}#arm`} transform={murimArtworkTransform} />

          {isTrainingSword ? (
            <use
              key={weaponId}
              href={`${murimMascotUrl}#training-sword`}
              transform={murimArtworkTransform}
              className="ui-preview-piece"
            />
          ) : weaponItem && (
            <g key={weaponId} className="ui-preview-piece" transform="translate(87 69.5) rotate(18)">
              {usesPole ? (
                <>
                  <rect x="-2.8" y="-38" width="5.6" height="52" rx="2.5" fill={weaponItem.accentHex} stroke={weaponItem.secondaryHex} strokeWidth="1.5" />
                  {isStaff ? (
                    <>
                      <circle cy="-44" r="7" fill="#7C3AED" stroke={weaponItem.secondaryHex} strokeWidth="2" />
                      <circle cy="-44" r="3" fill="#E0F2FE" />
                    </>
                  ) : (
                    <path d="M0 -53 L6 -40 L0 -32 L-6 -40 Z" fill={weaponItem.secondaryHex} stroke="#FFF1DB" strokeWidth="1.5" strokeLinejoin="round" />
                  )}
                </>
              ) : (
                <>
                  <rect x="-3.8" y="-12" width="7.6" height="22" rx="2.4" fill="#27272A" stroke={weaponItem.secondaryHex} strokeWidth="1.5" />
                  <path d={bladeOutline} fill={weaponItem.accentHex} stroke={weaponItem.secondaryHex} strokeWidth="2" strokeLinejoin="round" />
                  {weaponItem.id === 'arma_presas_monarca' && (
                    <path d="M8 -38 Q15 -23 8 -11 H4 Z" fill="#17171C" stroke="#F59E0B" strokeWidth="1.4" strokeLinejoin="round" />
                  )}
                  {weaponItem.iconName === 'Sparkles' && <path d="M0 -35 V-12" stroke="#FFF" strokeWidth="1.6" />}
                  <rect x="-10.5" y="-10" width="21" height="5.5" rx="2.2" fill={weaponItem.secondaryHex} stroke="#27272A" strokeWidth="1.2" />
                </>
              )}
            </g>
          )}

          <use href={`${murimMascotUrl}#hand`} transform={murimArtworkTransform} />
        </g>

        <use href={`${murimMascotUrl}#helmet`} transform={murimArtworkTransform} />
        {/* ELMO EQUIPADO */}
        {helmItem && helmItem.id !== 'elmo_couro_novato' && (
          <g key={helmItem.id} className="ui-preview-piece" transform="translate(0 -3)">
            {helmItem.id === 'elmo_mercador_vidente' ? (
              <>
                <path
                  d="M 34 29 Q 36 12 60 12 Q 84 12 86 29 Q 72 21 60 21 Q 48 21 34 29 Z"
                  fill={helmItem.accentHex}
                  fillOpacity="0.6"
                  stroke={helmItem.secondaryHex}
                  strokeWidth="2"
                />
                {/* Monóculo dourado no olho direito */}
                <circle
                  cx="71"
                  cy="36"
                  r="7.5"
                  fill="rgba(234,179,8,0.18)"
                  stroke="#FACC15"
                  strokeWidth="2"
                />
                <line x1="78" y1="39" x2="84" y2="48" stroke="#FACC15" strokeWidth="1.4" />
              </>
            ) : helmItem.id === 'elmo_sabio_abissal' ? (
              <>
                <path
                  d="M 33 31 Q 36 11 60 11 Q 84 11 87 31 L 83 39 Q 60 25 37 39 Z"
                  fill={helmItem.accentHex}
                  fillOpacity="0.58"
                  stroke={helmItem.secondaryHex}
                  strokeWidth="2"
                />
                <polygon
                  points="60,3 65,15 60,22 55,15"
                  fill="#F97316"
                  stroke="#FED7AA"
                  strokeWidth="1.4"
                />
              </>
            ) : helmItem.id === 'elmo_presa_carmesim' ? (
              <>
                <path
                  d="M 33 33 Q 35 12 60 12 Q 85 12 87 33 L 83 48 Q 60 54 37 48 Z"
                  fill={helmItem.accentHex}
                  fillOpacity="0.64"
                  stroke={helmItem.secondaryHex}
                  strokeWidth="2"
                />
                <path d="M 39 19 L 27 4 L 45 15 Z" fill="#FBBF24" stroke="#FEF08A" strokeWidth="1.2" />
                <path d="M 81 19 L 93 4 L 75 15 Z" fill="#FBBF24" stroke="#FEF08A" strokeWidth="1.2" />
                <path d="M 46 43 L 60 46 L 74 43" fill="none" stroke="#FEF08A" strokeWidth="1.8" strokeLinecap="round" />
              </>
            ) : helmItem.id === 'elmo_monarca' ? (
              <>
                <path
                  d="M 35 23 L 41 6 L 52 17 L 60 3 L 68 17 L 79 6 L 85 23 Z"
                  fill={helmItem.accentHex}
                  stroke="#FEF08A"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="60" cy="14" r="3.2" fill="#F97316" stroke="#FEF08A" strokeWidth="1" />
              </>
            ) : helmItem.iconName === 'Crown' ? (
              <>
                <path
                  d="M 34 27 L 39 9 L 51 18 L 60 5 L 69 18 L 81 9 L 86 27 Q 60 22 34 27 Z"
                  fill={helmItem.accentHex}
                  fillOpacity="0.88"
                  stroke={helmItem.secondaryHex}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <polygon points="60,11 64,17 60,22 56,17" fill={helmItem.secondaryHex} />
              </>
            ) : helmItem.iconName === 'Flame' ? (
              <>
                <path
                  d="M 33 32 Q 35 12 60 12 Q 85 12 87 32 L 82 44 Q 60 30 38 44 Z"
                  fill={helmItem.accentHex}
                  fillOpacity="0.72"
                  stroke={helmItem.secondaryHex}
                  strokeWidth="2"
                />
                <path
                  d="M 42 18 L 32 4 L 49 14 M 78 18 L 88 4 L 71 14"
                  fill={helmItem.secondaryHex}
                  stroke={helmItem.secondaryHex}
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </>
            ) : helmItem.iconName === 'Eye' ? (
              <>
                <path
                  d="M 33 27 Q 36 12 60 12 Q 84 12 87 27 Q 72 20 60 20 Q 48 20 33 27 Z"
                  fill={helmItem.accentHex}
                  fillOpacity="0.75"
                  stroke={helmItem.secondaryHex}
                  strokeWidth="2"
                />
                <rect
                  x="37"
                  y="30"
                  width="46"
                  height="11"
                  rx="5.5"
                  fill={helmItem.accentHex}
                  fillOpacity="0.28"
                  stroke={helmItem.secondaryHex}
                  strokeWidth="1.8"
                />
              </>
            ) : helmItem.iconName === 'Sparkles' || helmItem.iconName === 'Ghost' ? (
              <>
                <path
                  d="M 32 28 Q 60 18 88 28 L 85 21 Q 60 11 35 21 Z"
                  fill={helmItem.accentHex}
                  stroke={helmItem.secondaryHex}
                  strokeWidth="2"
                />
                <circle cx="60" cy="14" r="4" fill={helmItem.secondaryHex} />
                <path
                  d="M 28 24 Q 20 14 27 8 M 92 24 Q 100 14 93 8"
                  fill="none"
                  stroke={helmItem.secondaryHex}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <path
                  d="M 32 32 Q 35 10 60 10 Q 85 10 88 32 Q 73 21 60 21 Q 47 21 32 32 Z"
                  fill={helmItem.accentHex}
                  fillOpacity="0.82"
                  stroke={helmItem.secondaryHex}
                  strokeWidth="2"
                />
                <polygon
                  points="60,12 64,18 60,24 56,18"
                  fill={helmItem.secondaryHex}
                />
              </>
            )}
          </g>
        )}


        <g transform={murimArtworkTransform}>
          {eyeColor ? (
            <>
              <circle cx="305" cy="166" r="17" fill={eyeColor} />
              <circle cx="375" cy="166" r="17" fill={eyeColor} />
              <circle cx="305" cy="166" r="8" fill="#FFD9A8" />
              <circle cx="375" cy="166" r="8" fill="#FFD9A8" />
            </>
          ) : (
            <use href={`${murimMascotUrl}#eyes`} />
          )}
        </g>
      </svg>
    </motion.div>
  );
};

interface DungeonBossSpriteProps {
  variant: 'golem' | 'hydra' | 'sentinel' | 'dragon';
  hitId?: number;
  isDefeated?: boolean;
  isCriticalHit?: boolean;
}

export const DungeonBossSprite: React.FC<DungeonBossSpriteProps> = ({
  variant,
  hitId = 0,
  isDefeated = false,
  isCriticalHit = false,
}) => {
  const reduceMotion = useReducedMotion();
  const [bossScope, animateBoss] = useAnimate<SVGSVGElement>();
  const previousHitId = React.useRef(0);
  const [showCritFlash, setShowCritFlash] = React.useState(false);

  React.useEffect(() => {
    const boss = bossScope.current;
    if (!boss) return;
    const receivedHit = hitId !== previousHitId.current;
    previousHitId.current = hitId;

    if (reduceMotion || isDefeated) {
      animateBoss(boss, { x: 0, scale: 1 }, { duration: reduceMotion ? 0 : 0.16 });
      return;
    }
    if (!receivedHit) return;

    if (isCriticalHit) {
      setShowCritFlash(true);
      const timer = window.setTimeout(() => setShowCritFlash(false), 680);
      const hit = animateBoss(
        boss,
        { x: [null, 11, -5, 4, 0], scale: [null, 0.9, 1.07, 1] },
        { delay: 0.1, duration: 0.34, times: [0, 0.25, 0.55, 0.8, 1], ease: 'easeOut' },
      );
      return () => {
        window.clearTimeout(timer);
        hit.stop();
      };
    }

    const hit = animateBoss(
      boss,
      { x: [null, 7, -2, 0], scale: [null, 0.95, 1.02, 1] },
      { delay: 0.14, duration: 0.26, times: [0, 0.28, 0.62, 1], ease: 'easeOut' },
    );
    return () => hit.stop();
  }, [animateBoss, bossScope, hitId, isDefeated, isCriticalHit, reduceMotion]);

  return (
    <motion.div
      initial={false}
      animate={{ opacity: isDefeated ? 0.32 : 1, scale: isDefeated && !reduceMotion ? 0.89 : 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.26, delay: isDefeated && !reduceMotion ? 0.14 : 0 }}
      className="relative w-24 h-24 inline-flex items-center justify-center select-none"
    >
      {showCritFlash && (
        <span className="pointer-events-none absolute -top-2 right-0 z-10 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-950 shadow">
          Crítico!
        </span>
      )}
      <svg
        ref={bossScope}
        viewBox="0 0 120 120"
        className={`w-full h-full overflow-visible ${isDefeated ? '' : 'ui-sprite-idle'}`}
        role="img"
        aria-label={`Chefe de Masmorra (${variant})`}
      >
        <ellipse cx="60" cy="108" rx="38" ry="7" fill="rgba(249, 115, 22, 0.14)" />

        {variant === 'golem' && (
          <g>
            <rect x="14" y="46" width="18" height="40" rx="7" fill="#3F3F46" stroke="#71717A" strokeWidth="2" />
            <rect x="88" y="46" width="18" height="40" rx="7" fill="#3F3F46" stroke="#71717A" strokeWidth="2" />
            <rect x="38" y="84" width="16" height="22" rx="5" fill="#27272A" stroke="#52525B" strokeWidth="2" />
            <rect x="66" y="84" width="16" height="22" rx="5" fill="#27272A" stroke="#52525B" strokeWidth="2" />
            <rect x="30" y="34" width="60" height="54" rx="14" fill="#27272A" stroke="#71717A" strokeWidth="2.4" />
            <path d="M 46 42 L 60 56 L 54 66 L 68 78" fill="none" stroke="#F97316" strokeWidth="2.2" />
            <circle cx="60" cy="60" r="8" fill="#EA580C" stroke="#FED7AA" strokeWidth="2" />
            <rect x="40" y="20" width="40" height="20" rx="8" fill="#18181B" stroke="#71717A" strokeWidth="2" />
            <rect x="46" y="27" width="28" height="6" rx="3" fill="#09090B" />
            <circle cx="52" cy="30" r="2.6" fill="#F97316" />
            <circle cx="68" cy="30" r="2.6" fill="#F97316" />
          </g>
        )}

        {variant === 'hydra' && (
          <g>
            <path d="M 32 100 Q 32 68 60 68 Q 88 68 88 100 Z" fill="#18181B" stroke="#71717A" strokeWidth="2.2" />
            <circle cx="60" cy="86" r="7" fill="#EF4444" stroke="#FCA5A5" strokeWidth="1.5" />
            {[
              { x: 26, y: 42 },
              { x: 44, y: 26 },
              { x: 60, y: 20 },
              { x: 76, y: 26 },
              { x: 94, y: 42 },
            ].map((h, idx) => (
              <g key={idx}>
                <path
                  d={`M 60 72 Q ${(60 + h.x) / 2} 54 ${h.x} ${h.y + 8}`}
                  fill="none"
                  stroke="#3F3F46"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <circle cx={h.x} cy={h.y} r="10" fill="#111113" stroke="#71717A" strokeWidth="2" />
                <circle cx={h.x - 3} cy={h.y} r="1.8" fill="#F97316" />
                <circle cx={h.x + 3} cy={h.y} r="1.8" fill="#F97316" />
              </g>
            ))}
          </g>
        )}

        {variant === 'sentinel' && (
          <g>
            <polygon points="60,12 92,48 78,100 42,100 28,48" fill="#18181B" stroke="#71717A" strokeWidth="2.4" />
            <polygon points="60,28 76,52 60,82 44,52" fill="#27272A" stroke="#F97316" strokeWidth="1.8" />
            <circle cx="51" cy="48" r="3.5" fill="#FB923C" />
            <circle cx="69" cy="48" r="3.5" fill="#FB923C" />
          </g>
        )}

        {variant === 'dragon' && (
          <g>
            <path d="M 28 52 L 8 28 L 20 68 Z" fill="#7F1D1D" stroke="#F87171" strokeWidth="2" />
            <path d="M 92 52 L 112 28 L 100 68 Z" fill="#7F1D1D" stroke="#F87171" strokeWidth="2" />
            <rect x="34" y="34" width="52" height="62" rx="16" fill="#450A0A" stroke="#EF4444" strokeWidth="2.4" />
            <path d="M 40 30 L 30 10 L 48 24" fill="#FBBF24" />
            <path d="M 80 30 L 90 10 L 72 24" fill="#FBBF24" />
            <circle cx="50" cy="46" r="3.8" fill="#FDE047" />
            <circle cx="70" cy="46" r="3.8" fill="#FDE047" />
            <polygon points="60,58 68,72 60,86 52,72" fill="#F97316" stroke="#FDE047" strokeWidth="1.5" />
          </g>
        )}
      </svg>
    </motion.div>
  );
};
