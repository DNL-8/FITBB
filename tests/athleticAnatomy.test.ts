import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAthleticBodyGeometry,
  computeMuscleHeatmapLevel,
  getHeatmapColorStops,
} from '../src/utils/athleticAnatomy.ts';
import {
  getExerciseMotionSpec,
  interpolatePose,
} from '../src/utils/exerciseMotion.ts';
import type { ExerciseItem } from '../src/types/fitness.ts';

function makeExercise(id: string, name: string): ExerciseItem {
  return {
    id,
    name,
    prescription: '3 séries x 12 repetições',
    restSeconds: 60,
    muscleGroups: ['Quadríceps', 'Glúteos'],
    executionTip: 'Controle o movimento.',
  };
}

test('getExerciseMotionSpec diferencia Agachamento goblet do agachamento frontal com barra', () => {
  const goblet = getExerciseMotionSpec(makeExercise('ex-goblet', 'Agachamento goblet'));
  assert.equal(goblet.archetype, 'goblet_squat');
  assert.equal(goblet.equipmentProp, 'goblet_weight');
  assert.deepEqual(goblet.highlightZones, ['quads', 'glutes', 'core']);

  const front = getExerciseMotionSpec(makeExercise('ex-front', 'Agachamento Frontal (Front Squat)'));
  assert.equal(front.archetype, 'front_squat');
  assert.equal(front.equipmentProp, 'barbell_rack');
});

test('getHeatmapColorStops muda de cor progressivamente conforme a intensidade muscular', () => {
  const low = getHeatmapColorStops(0.15);
  const moderate = getHeatmapColorStops(0.45);
  const high = getHeatmapColorStops(0.75);
  const peak = getHeatmapColorStops(0.98);

  assert.equal(low.levelLabel, 'Baixa');
  assert.equal(moderate.levelLabel, 'Moderada');
  assert.equal(high.levelLabel, 'Alta');
  assert.equal(peak.levelLabel, 'Máxima');

  const hexPattern = /^#[0-9A-F]{6}$/;
  for (const stops of [low, moderate, high, peak]) {
    assert.match(stops.highlight, hexPattern);
    assert.match(stops.mid, hexPattern);
    assert.match(stops.edge, hexPattern);
    assert.match(stops.stroke, hexPattern);
    assert.match(stops.glow, hexPattern);
  }

  assert.notEqual(low.mid, moderate.mid);
  assert.notEqual(moderate.mid, high.mid);
  assert.notEqual(high.mid, peak.mid);
});

test('computeMuscleHeatmapLevel diferencia papel muscular e isola o músculo selecionado', () => {
  const zones = ['quads', 'glutes', 'core'] as const;

  const primaryPeak = computeMuscleHeatmapLevel([...zones], 'quads', 'all', 1.0, 1);
  const synergistPeak = computeMuscleHeatmapLevel([...zones], 'glutes', 'all', 1.0, 1);
  const stabilizerPeak = computeMuscleHeatmapLevel([...zones], 'core', 'all', 1.0, 1);

  assert.equal(primaryPeak.role, 'Motor primário');
  assert.equal(synergistPeak.role, 'Sinergista');
  assert.equal(stabilizerPeak.role, 'Estabilizador');
  assert.ok(primaryPeak.intensity > synergistPeak.intensity);
  assert.ok(synergistPeak.intensity > stabilizerPeak.intensity);
  assert.equal(primaryPeak.isFocused, true);
  assert.equal(primaryPeak.isDimmed, false);

  const primaryStart = computeMuscleHeatmapLevel([...zones], 'quads', 'quads', 0.35, 0);
  const primaryAtPeak = computeMuscleHeatmapLevel([...zones], 'quads', 'quads', 1.0, 1);
  assert.ok(primaryAtPeak.intensity > primaryStart.intensity);
  assert.notEqual(primaryStart.colors.mid, primaryAtPeak.colors.mid);

  const dimmedGlutes = computeMuscleHeatmapLevel([...zones], 'glutes', 'quads', 1.0, 1);
  assert.equal(dimmedGlutes.isFocused, false);
  assert.equal(dimmedGlutes.isDimmed, true);
});

test('buildAthleticBodyGeometry gera caminhos SVG finitos e destaques musculares para todos os arquétipos', () => {
  const exercises: ExerciseItem[] = [
    makeExercise('ex-1', 'Agachamento goblet'),
    makeExercise('ex-2', 'Paralelas (Dips)'),
    makeExercise('ex-3', 'Remada Curvada'),
    makeExercise('ex-4', 'Flexão de braços'),
    makeExercise('ex-5', 'Desenvolvimento militar'),
    makeExercise('ex-6', 'Remada Unilateral (Serrote)'),
    makeExercise('ex-7', 'Rosca Direta + Tríceps Testa'),
    makeExercise('ex-8', 'Elevação de Pernas / L-Sit Hold'),
    makeExercise('ex-9', 'Agachamento Búlgaro'),
    makeExercise('ex-10', 'Levantamento Terra Romeno (Stiff)'),
    makeExercise('ex-11', 'Agachamento Frontal (Front Squat)'),
    makeExercise('ex-12', 'Elevação Pélvica Unilateral'),
    makeExercise('ex-13', 'Panturrilha em Pé Unilateral'),
    makeExercise('ex-14', 'Prancha Abdominal com Toque no Ombro'),
    makeExercise('ex-15', 'Afundo Alternado'),
    makeExercise('ex-16', 'Burpee'),
    makeExercise('ex-17', 'Polichinelo'),
    makeExercise('ex-18', 'Corrida estacionária alta'),
    makeExercise('ex-19', 'Superman'),
    makeExercise('ex-20', 'Gato camelo'),
  ];

  for (const exercise of exercises) {
    const spec = getExerciseMotionSpec(exercise);
    for (const progress of [0, 0.24, 0.5, 0.78]) {
      const { pose } = interpolatePose(spec.keyFrames, progress);
      const geometry = buildAthleticBodyGeometry(
        pose,
        spec.archetype,
        spec.highlightZones
      );

      const requiredPaths = [
        geometry.torsoPath,
        geometry.torsoContourPath,
        ...geometry.anatomicalDetailPaths,
        geometry.neckPath,
        geometry.headPath,
        geometry.headHighlightPath,
        geometry.facePath,
        geometry.hairPath,
        geometry.frontThighPath,
        geometry.frontShortsPath,
        geometry.shortsWaistbandPath,
        ...(geometry.backShortsPath ? [geometry.backShortsPath] : []),
        geometry.frontShinPath,
        geometry.frontFootPath,
        geometry.frontShoeSolePath,
        ...(geometry.backShoeSolePath ? [geometry.backShoeSolePath] : []),
        geometry.frontUpperArmPath,
        geometry.frontForearmPath,
        geometry.frontHandPath,
        ...(geometry.backHandPath ? [geometry.backHandPath] : []),
      ];

      for (const pathStr of requiredPaths) {
        assert.ok(pathStr.length > 5, `${exercise.name} gerou path vazio`);
        assert.equal(/NaN|undefined|Infinity/.test(pathStr), false, `${exercise.name}: ${pathStr}`);
      }

      for (const { x1, y1, x2, y2 } of Object.values(geometry.surfaceLighting)) {
        assert.ok([x1, y1, x2, y2].every(Number.isFinite), exercise.name);
        assert.ok(Math.hypot(x2 - x1, y2 - y1) > 0, exercise.name);
      }
      const shin = geometry.surfaceLighting.shin;
      const shinDotProduct = (shin.x2 - shin.x1) * (pose.foot.x - pose.knee.x) +
        (shin.y2 - shin.y1) * (pose.foot.y - pose.knee.y);
      assert.ok(Math.abs(shinDotProduct) < 1e-6, exercise.name);

      const coveredZones = new Set(geometry.muscleOverlays.map((overlay) => overlay.zone));
      for (const zone of spec.highlightZones) {
        assert.equal(coveredZones.has(zone), true, `${exercise.name} sem overlay para ${zone}`);
      }
      if (spec.archetype === 'jumping_jack') {
        assert.equal(
          geometry.muscleOverlays.filter((o) => o.zone === 'shoulders').length,
          2,
          'Polichinelo deve destacar ambos os ombros'
        );
        assert.equal(
          geometry.muscleOverlays.filter((o) => o.zone === 'calves').length,
          2,
          'Polichinelo deve destacar ambas as panturrilhas'
        );
      }
      for (const overlay of geometry.muscleOverlays) {
        assert.ok(overlay.d.length > 5);
        assert.ok(overlay.striationD.length > 3);
        assert.equal(/NaN|undefined|Infinity/.test(overlay.d), false);
        assert.equal(/NaN|undefined|Infinity/.test(overlay.striationD), false);
      }
    }
  }
});
