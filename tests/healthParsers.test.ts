import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCsvTemplateSample,
  parseCsvHealthContent,
} from '../src/utils/healthParsers.ts';

test('parseCsvHealthContent gera IDs determinísticos e mantém métricas diárias', () => {
  const csv = buildCsvTemplateSample();
  const parsedA = parseCsvHealthContent(csv, 'sample.csv', 190);
  const parsedB = parseCsvHealthContent(csv, 'sample.csv', 190);

  assert.equal(parsedA.activities.length, 4);
  assert.equal(parsedA.dailyMetrics.length, 4);
  assert.deepEqual(
    parsedA.activities.map((a) => a.externalId),
    parsedB.activities.map((a) => a.externalId)
  );
});

test('parseCsvHealthContent deduplica linhas idênticas dentro do mesmo CSV', () => {
  const csv = [
    'data,atividade,tipo,duracao,distancia,calorias',
    '2026-11-10,Corrida Matinal,Running,38,6.4,420',
    '2026-11-10,Corrida Matinal,Running,38,6.4,420',
    '2026-11-11,Pedal Leve,Cycling,45,15.0,390',
  ].join('\n');

  const parsed = parseCsvHealthContent(csv, 'dup.csv', 190);
  assert.equal(parsed.activities.length, 2);
  assert.equal(parsed.warnings.length, 1);
});

test('parseCsvHealthContent falha com erro claro quando falta coluna de data', () => {
  const badCsv = 'atividade,duracao\nCorrida,30';
  assert.throws(() => parseCsvHealthContent(badCsv, 'bad.csv', 190), /Coluna de data/i);
});
