import {
  DailyHealthMetric,
  HealthActivity,
  ParsedHealthImport,
} from '../types/fitness';
import {
  calculateActivityXp,
  computeZoneMinutesFromHrStream,
  downsampleArray,
  estimateZoneMinutesFromAvgHr,
  getLocalDateKey,
} from './rpgLogic';

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function stableHashBase36(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildStableActivityId(
  prefix: string,
  parts: {
    dateKey: string;
    startedAtKey: string;
    durationMinutes: number;
    distanceKm: number;
    sportType: string;
  }
): string {
  const normalizedRaw = [
    prefix,
    parts.dateKey,
    parts.startedAtKey,
    String(Math.max(1, Math.round(parts.durationMinutes))),
    Number(parts.distanceKm || 0).toFixed(2),
    parts.sportType.trim().toLowerCase(),
  ].join('|');
  return sanitizeId(`${prefix}_${parts.dateKey}_${stableHashBase36(normalizedRaw)}`);
}

function deduplicateParsedActivities(
  list: Omit<HealthActivity, 'userId'>[]
): { unique: Omit<HealthActivity, 'userId'>[]; intraDuplicates: number } {
  const seen = new Set<string>();
  const unique: Omit<HealthActivity, 'userId'>[] = [];
  let intraDuplicates = 0;
  for (const act of list) {
    if (seen.has(act.externalId)) {
      intraDuplicates += 1;
      continue;
    }
    seen.add(act.externalId);
    unique.push(act);
  }
  return { unique, intraDuplicates };
}

function parseIsoOrAppleDate(raw: string): Date | null {
  if (!raw) return null;
  // Apple Health formato típico: "2026-11-10 07:15:00 -0300"
  const normalized = raw.replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return d;
}

// ============================================================================
// PARSER GPX
// ============================================================================

export function parseGpxContent(
  xmlText: string,
  fileName: string,
  maxHr: number = 190
): ParsedHealthImport {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Arquivo GPX "${fileName}" inválido ou malformado.`);
  }

  const trkName =
    doc.querySelector('trk > name')?.textContent?.trim() ||
    doc.querySelector('metadata > name')?.textContent?.trim() ||
    fileName.replace(/\.gpx$/i, '');

  const sportType =
    doc.querySelector('trk > type')?.textContent?.trim() || 'Running';

  const trkpts = Array.from(doc.querySelectorAll('trkpt'));
  const points = trkpts.length > 0 ? trkpts : Array.from(doc.querySelectorAll('rtept'));

  if (points.length === 0) {
    throw new Error(`Nenhum ponto de trilha (<trkpt>) encontrado em "${fileName}".`);
  }

  let totalDistKm = 0;
  let elevationGainM = 0;
  let prevLat: number | null = null;
  let prevLon: number | null = null;
  let prevEle: number | null = null;
  let firstTime: Date | null = null;
  let lastTime: Date | null = null;
  const hrValues: number[] = [];

  for (const pt of points) {
    const lat = Number(pt.getAttribute('lat'));
    const lon = Number(pt.getAttribute('lon'));

    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      if (prevLat !== null && prevLon !== null) {
        totalDistKm += haversineDistanceKm(prevLat, prevLon, lat, lon);
      }
      prevLat = lat;
      prevLon = lon;
    }

    const eleText = pt.querySelector('ele')?.textContent;
    if (eleText) {
      const ele = Number(eleText);
      if (!Number.isNaN(ele)) {
        if (prevEle !== null && ele > prevEle + 0.5) {
          elevationGainM += ele - prevEle;
        }
        prevEle = ele;
      }
    }

    const timeText = pt.querySelector('time')?.textContent?.trim();
    if (timeText) {
      const dt = new Date(timeText);
      if (!Number.isNaN(dt.getTime())) {
        if (!firstTime) firstTime = dt;
        lastTime = dt;
      }
    }

    // Busca tag hr com ou sem namespace (gpxtpx:hr, ns3:hr, hr)
    const hrNodes = pt.getElementsByTagName('*');
    for (let i = 0; i < hrNodes.length; i++) {
      const tag = hrNodes[i].localName || hrNodes[i].tagName;
      if (tag === 'hr' || tag.endsWith(':hr')) {
        const hrVal = Number(hrNodes[i].textContent);
        if (!Number.isNaN(hrVal) && hrVal >= 35 && hrVal <= 230) {
          hrValues.push(hrVal);
        }
        break;
      }
    }
  }

  const startDt = firstTime ?? new Date();
  const durationMinutes =
    firstTime && lastTime
      ? Math.max(1, Math.round((lastTime.getTime() - firstTime.getTime()) / 60000))
      : Math.max(10, Math.round(totalDistKm * 6));

  if (!firstTime) {
    warnings.push('O arquivo GPX não continha timestamps; duração estimada pela distância.');
  }

  const avgHeartRate =
    hrValues.length > 0
      ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
      : null;
  const maxHeartRate =
    hrValues.length > 0 ? Math.round(Math.max(...hrValues)) : null;

  const zoneMinutes =
    hrValues.length > 0
      ? computeZoneMinutesFromHrStream(hrValues, durationMinutes, maxHr)
      : estimateZoneMinutesFromAvgHr(avgHeartRate, durationMinutes, maxHr);

  const distanceKm = Number(totalDistKm.toFixed(2));
  const calories = Math.round(
    durationMinutes * (avgHeartRate ? (avgHeartRate / 140) * 8.5 : 8)
  );
  const dateKey = getLocalDateKey(startDt);
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const coordFingerprint = `${Number(firstPt.getAttribute('lat') || 0).toFixed(4)},${Number(
    firstPt.getAttribute('lon') || 0
  ).toFixed(4)}-${Number(lastPt.getAttribute('lat') || 0).toFixed(4)},${Number(
    lastPt.getAttribute('lon') || 0
  ).toFixed(4)}`;
  const externalId = firstTime
    ? buildStableActivityId('gpx', {
        dateKey,
        startedAtKey: firstTime.toISOString().slice(0, 16),
        durationMinutes,
        distanceKm,
        sportType,
      })
    : sanitizeId(
        `gpx_nots_${stableHashBase36(
          `gpx|no_ts|${coordFingerprint}|${durationMinutes}|${distanceKm.toFixed(2)}|${sportType
            .trim()
            .toLowerCase()}`
        )}`
      );

  const activity: Omit<HealthActivity, 'userId'> = {
    id: externalId,
    externalId,
    source: 'gpx',
    title: trkName.slice(0, 140),
    sportType: sportType.slice(0, 60),
    dateKey,
    startedAt: startDt.toISOString(),
    durationMinutes,
    distanceKm,
    calories,
    elevationGainM: Math.round(elevationGainM),
    avgHeartRate,
    maxHeartRate,
    zoneMinutes,
    hrSamplePoints: downsampleArray(hrValues, 40),
    xpAwarded: calculateActivityXp(durationMinutes, distanceKm, sportType),
    createdAt: new Date().toISOString(),
  };

  return {
    activities: [activity],
    dailyMetrics: [],
    warnings,
    sourceLabel: `GPX (${fileName})`,
  };
}

// ============================================================================
// PARSER APPLE HEALTH (export.xml) COM LEITURA EM BLOCOS
// ============================================================================

function extractAttr(tag: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const match = tag.match(regex);
  return match ? match[1] : null;
}

function mapAppleWorkoutType(rawType: string): string {
  return rawType
    .replace(/^HKWorkoutActivityType/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim() || 'Treino';
}

export async function parseAppleHealthXmlFile(
  file: File,
  maxHr: number = 190,
  onProgress?: (percent: number) => void
): Promise<ParsedHealthImport> {
  const warnings: string[] = [];
  const activities: Omit<HealthActivity, 'userId'>[] = [];

  const dailyBuckets: Record<
    string,
    {
      steps: number;
      activeCalories: number;
      sleepHours: number;
      rhrSum: number;
      rhrCount: number;
      hrvSum: number;
      hrvCount: number;
    }
  > = {};

  const hrSamplesByDay: Record<string, Array<{ ts: number; bpm: number }>> = {};

  const ensureBucket = (dateKey: string) => {
    if (!dailyBuckets[dateKey]) {
      dailyBuckets[dateKey] = {
        steps: 0,
        activeCalories: 0,
        sleepHours: 0,
        rhrSum: 0,
        rhrCount: 0,
        hrvSum: 0,
        hrvCount: 0,
      };
    }
    return dailyBuckets[dateKey];
  };

  // Leitura em chunks de 2MB para suportar exports reais de Apple Health sem travar a thread
  const CHUNK_SIZE = 2 * 1024 * 1024;
  let offset = 0;
  let leftover = '';

  const cutoffMs = Date.now() - 120 * 86400 * 1000; // Últimos 120 dias

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const chunkText = await slice.text();
    const combined = leftover + chunkText;
    const lastNewline = combined.lastIndexOf('\n');
    const processable =
      lastNewline >= 0 && offset + CHUNK_SIZE < file.size
        ? combined.slice(0, lastNewline)
        : combined;
    leftover =
      lastNewline >= 0 && offset + CHUNK_SIZE < file.size
        ? combined.slice(lastNewline + 1)
        : '';

    const lines = processable.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('<Workout ')) {
        const startRaw = extractAttr(trimmed, 'startDate');
        const startDt = startRaw ? parseIsoOrAppleDate(startRaw) : null;
        if (!startDt || startDt.getTime() < cutoffMs) continue;

        const rawType = extractAttr(trimmed, 'workoutActivityType') || 'Workout';
        const sportType = mapAppleWorkoutType(rawType);
        const durationMin = Math.max(
          1,
          Math.round(Number(extractAttr(trimmed, 'duration') || '0'))
        );
        const distRaw = Number(extractAttr(trimmed, 'totalDistance') || '0');
        const distUnit = (extractAttr(trimmed, 'totalDistanceUnit') || 'km').toLowerCase();
        const distanceKm = Number(
          (distUnit === 'm' ? distRaw / 1000 : distUnit === 'mi' ? distRaw * 1.609 : distRaw).toFixed(2)
        );
        const calories = Math.round(
          Number(extractAttr(trimmed, 'totalEnergyBurned') || '0')
        );
        const dateKey = getLocalDateKey(startDt);
        const safeDistanceKm = Number.isNaN(distanceKm) ? 0 : distanceKm;
        const externalId = buildStableActivityId('apple', {
          dateKey,
          startedAtKey: startDt.toISOString().slice(0, 16),
          durationMinutes: durationMin,
          distanceKm: safeDistanceKm,
          sportType,
        });

        activities.push({
          id: externalId,
          externalId,
          source: 'apple_health',
          title: `Apple Health · ${sportType}`.slice(0, 140),
          sportType: sportType.slice(0, 60),
          dateKey,
          startedAt: startDt.toISOString(),
          durationMinutes: durationMin,
          distanceKm: Number.isNaN(distanceKm) ? 0 : distanceKm,
          calories: Number.isNaN(calories) ? 0 : calories,
          elevationGainM: 0,
          avgHeartRate: null,
          maxHeartRate: null,
          zoneMinutes: [0, Math.round(durationMin * 0.6), Math.round(durationMin * 0.4), 0, 0],
          hrSamplePoints: [],
          xpAwarded: calculateActivityXp(durationMin, Number.isNaN(distanceKm) ? 0 : distanceKm, sportType),
          createdAt: new Date().toISOString(),
        });
      } else if (trimmed.startsWith('<Record ')) {
        const recType = extractAttr(trimmed, 'type');
        if (!recType) continue;
        const startRaw = extractAttr(trimmed, 'startDate');
        const startDt = startRaw ? parseIsoOrAppleDate(startRaw) : null;
        if (!startDt || startDt.getTime() < cutoffMs) continue;

        const dateKey = getLocalDateKey(startDt);
        const valNum = Number(extractAttr(trimmed, 'value') || '0');

        if (recType === 'HKQuantityTypeIdentifierStepCount') {
          ensureBucket(dateKey).steps += Math.round(valNum);
        } else if (recType === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
          ensureBucket(dateKey).activeCalories += Math.round(valNum);
        } else if (recType === 'HKQuantityTypeIdentifierRestingHeartRate') {
          if (valNum >= 30 && valNum <= 140) {
            const b = ensureBucket(dateKey);
            b.rhrSum += valNum;
            b.rhrCount += 1;
          }
        } else if (recType === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
          if (valNum >= 5 && valNum <= 300) {
            const b = ensureBucket(dateKey);
            b.hrvSum += valNum;
            b.hrvCount += 1;
          }
        } else if (recType === 'HKCategoryTypeIdentifierSleepAnalysis') {
          const endRaw = extractAttr(trimmed, 'endDate');
          const endDt = endRaw ? parseIsoOrAppleDate(endRaw) : null;
          const sleepVal = extractAttr(trimmed, 'value') || '';
          if (
            endDt &&
            (sleepVal.includes('Asleep') || sleepVal === '1')
          ) {
            const hrs = (endDt.getTime() - startDt.getTime()) / 3600000;
            if (hrs > 0 && hrs <= 16) {
              ensureBucket(dateKey).sleepHours += hrs;
            }
          }
        } else if (recType === 'HKQuantityTypeIdentifierHeartRate') {
          if (valNum >= 35 && valNum <= 230) {
            if (!hrSamplesByDay[dateKey]) hrSamplesByDay[dateKey] = [];
            if (hrSamplesByDay[dateKey].length < 4000) {
              hrSamplesByDay[dateKey].push({ ts: startDt.getTime(), bpm: valNum });
            }
          }
        }
      }
    }

    offset += CHUNK_SIZE;
    if (onProgress) {
      onProgress(Math.min(95, Math.round((offset / file.size) * 100)));
    }
    // Libera o event loop brevemente em arquivos grandes
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Enriquecer cada Workout com amostras de FC que coincidem no intervalo
  for (const act of activities) {
    const daySamples = hrSamplesByDay[act.dateKey];
    if (!daySamples || daySamples.length === 0) continue;
    const startMs = new Date(act.startedAt).getTime();
    const endMs = startMs + act.durationMinutes * 60000;
    const matched = daySamples
      .filter((s) => s.ts >= startMs - 60000 && s.ts <= endMs + 60000)
      .map((s) => s.bpm);

    if (matched.length > 0) {
      act.avgHeartRate = Math.round(matched.reduce((a, b) => a + b, 0) / matched.length);
      act.maxHeartRate = Math.round(Math.max(...matched));
      act.zoneMinutes = computeZoneMinutesFromHrStream(matched, act.durationMinutes, maxHr);
      act.hrSamplePoints = downsampleArray(matched, 40);
    }
  }

  const dailyMetrics: Omit<DailyHealthMetric, 'userId'>[] = Object.entries(dailyBuckets).map(
    ([dateKey, b]) => {
      const rhr = b.rhrCount > 0 ? Math.round(b.rhrSum / b.rhrCount) : null;
      const hrv = b.hrvCount > 0 ? Math.round(b.hrvSum / b.hrvCount) : null;
      const sleepHours = Number(Math.min(16, b.sleepHours).toFixed(1));
      return {
        id: dateKey,
        dateKey,
        steps: b.steps,
        activeCalories: b.activeCalories,
        sleepHours,
        restingHeartRate: rhr,
        hrvMs: hrv,
        trainingLoadScore: Math.round(b.activeCalories / 10),
        recoveryScore: sleepHours >= 7 ? 85 : sleepHours > 0 ? 70 : 75,
        sources: ['apple_health'],
        updatedAt: new Date().toISOString(),
      };
    }
  );

  if (activities.length === 0 && dailyMetrics.length === 0) {
    warnings.push(
      'Nenhum registro recente (últimos 120 dias) foi encontrado no arquivo Apple Health XML.'
    );
  }

  const { unique: uniqueActivities, intraDuplicates } = deduplicateParsedActivities(activities);
  uniqueActivities.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (intraDuplicates > 0) {
    warnings.push(
      `${intraDuplicates} atividade(s) duplicada(s) no próprio arquivo Apple Health foram ignoradas na leitura.`
    );
  }

  if (onProgress) onProgress(100);

  return {
    activities: uniqueActivities,
    dailyMetrics: dailyMetrics.slice(0, 120),
    warnings,
    sourceLabel: `Apple Health (${file.name})`,
  };
}

// ============================================================================
// PARSER CSV (Métricas Diárias ou Atividades)
// ============================================================================

export function parseCsvHealthContent(
  csvText: string,
  fileName: string,
  maxHr: number = 190
): ParsedHealthImport {
  const warnings: string[] = [];
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('O arquivo CSV precisa conter cabeçalho e pelo menos 1 linha de dados.');
  }

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0]
    .split(delimiter)
    .map((h) => h.trim().toLowerCase().replace(/["']/g, ''));

  const findCol = (aliases: string[]): number =>
    headers.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));

  const colDate = findCol(['date', 'data', 'dia']);
  const colSteps = findCol(['steps', 'passos']);
  const colCalories = findCol(['calories', 'calorias', 'kcal']);
  const colSleep = findCol(['sleep', 'sono']);
  const colRhr = findCol(['resting_hr', 'fc_repouso', 'rhr', 'repouso']);
  const colHrv = findCol(['hrv', 'vfc']);
  const colTitle = findCol(['title', 'atividade', 'workout', 'treino', 'nome']);
  const colSport = findCol(['sport', 'tipo', 'modalidade']);
  const colDuration = findCol(['duration', 'duracao', 'duração', 'minutes', 'minutos']);
  const colDistance = findCol(['distance', 'distancia', 'distância', 'km']);
  const colAvgHr = findCol(['avg_hr', 'fc_media', 'fc média', 'bpm_medio']);
  const colMaxHr = findCol(['max_hr', 'fc_max', 'fc máxima', 'bpm_max']);
  const colExternalId = findCol(['external_id', 'id_externo', 'datauuid', 'uuid']);
  const colTime = findCol(['hora', 'time', 'started_at', 'inicio']);

  if (colDate === -1) {
    throw new Error(
      'Coluna de data não encontrada no CSV (use "data" ou "date" no formato YYYY-MM-DD).'
    );
  }

  const activities: Omit<HealthActivity, 'userId'>[] = [];
  const dailyMetricsByDate = new Map<string, Omit<DailyHealthMetric, 'userId'>>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
    const rawDate = cols[colDate];
    if (!rawDate) continue;

    let dateKey = rawDate.slice(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateKey)) {
      const [d, m, y] = dateKey.split('/');
      dateKey = `${y}-${m}-${d}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      warnings.push(`Linha ${i + 1} ignorada: data "${rawDate}" inválida.`);
      continue;
    }

    const steps = colSteps >= 0 ? Math.max(0, Math.round(Number(cols[colSteps]) || 0)) : 0;
    const calories =
      colCalories >= 0 ? Math.max(0, Math.round(Number(cols[colCalories]) || 0)) : 0;
    const sleepHours =
      colSleep >= 0 ? Math.min(24, Math.max(0, Number(cols[colSleep]) || 0)) : 0;
    const rhr =
      colRhr >= 0 && cols[colRhr] ? Math.round(Number(cols[colRhr])) : null;
    const hrv =
      colHrv >= 0 && cols[colHrv] ? Math.round(Number(cols[colHrv])) : null;

    if (steps > 0 || sleepHours > 0 || rhr !== null || calories > 0) {
      const prevMetric = dailyMetricsByDate.get(dateKey);
      const safeRhr = rhr && rhr >= 30 && rhr <= 140 ? rhr : null;
      const safeHrv = hrv && hrv >= 5 && hrv <= 300 ? hrv : null;
      dailyMetricsByDate.set(dateKey, {
        id: dateKey,
        dateKey,
        steps: Math.max(prevMetric?.steps ?? 0, steps),
        activeCalories: Math.max(prevMetric?.activeCalories ?? 0, calories),
        sleepHours: Number(Math.max(prevMetric?.sleepHours ?? 0, sleepHours).toFixed(1)),
        restingHeartRate: safeRhr ?? prevMetric?.restingHeartRate ?? null,
        hrvMs: safeHrv ?? prevMetric?.hrvMs ?? null,
        trainingLoadScore: Math.max(prevMetric?.trainingLoadScore ?? 0, Math.round(calories / 10)),
        recoveryScore: sleepHours >= 7 ? 85 : prevMetric?.recoveryScore ?? 70,
        sources: ['csv'],
        updatedAt: new Date().toISOString(),
      });
    }

    const durationMinutes =
      colDuration >= 0 ? Math.max(0, Math.round(Number(cols[colDuration]) || 0)) : 0;
    const distanceKm =
      colDistance >= 0 ? Math.max(0, Number((Number(cols[colDistance]) || 0).toFixed(2))) : 0;

    if (durationMinutes > 0 || distanceKm > 0 || colTitle >= 0) {
      const title =
        (colTitle >= 0 && cols[colTitle]) ||
        (colSport >= 0 && cols[colSport]) ||
        'Atividade CSV';
      const sportType = (colSport >= 0 && cols[colSport]) || 'Workout';
      const avgHr =
        colAvgHr >= 0 && cols[colAvgHr] ? Math.round(Number(cols[colAvgHr])) : null;
      const maxHrAct =
        colMaxHr >= 0 && cols[colMaxHr] ? Math.round(Number(cols[colMaxHr])) : null;
      const dur = Math.max(1, durationMinutes || Math.round(distanceKm * 6) || 20);
      const rawExternal = colExternalId >= 0 ? cols[colExternalId]?.trim() : '';
      const rawTime = colTime >= 0 ? cols[colTime]?.trim() : '';
      const externalId = rawExternal
        ? sanitizeId(`csv_${rawExternal}`)
        : buildStableActivityId('csv', {
            dateKey,
            startedAtKey: rawTime || dateKey,
            durationMinutes: dur,
            distanceKm,
            sportType,
          });

      activities.push({
        id: externalId,
        externalId,
        source: 'csv',
        title: title.slice(0, 140),
        sportType: sportType.slice(0, 60),
        dateKey,
        startedAt: `${dateKey}T12:00:00.000Z`,
        durationMinutes: dur,
        distanceKm,
        calories: calories || dur * 7,
        elevationGainM: 0,
        avgHeartRate: avgHr && avgHr >= 30 && avgHr <= 240 ? avgHr : null,
        maxHeartRate: maxHrAct && maxHrAct >= 30 && maxHrAct <= 250 ? maxHrAct : null,
        zoneMinutes: estimateZoneMinutesFromAvgHr(avgHr, dur, maxHr),
        hrSamplePoints: [],
        xpAwarded: calculateActivityXp(dur, distanceKm, sportType),
        createdAt: new Date().toISOString(),
      });
    }
  }

  const { unique: uniqueActivities, intraDuplicates } = deduplicateParsedActivities(activities);
  if (intraDuplicates > 0) {
    warnings.push(
      `${intraDuplicates} linha(s) duplicada(s) dentro do CSV foram ignoradas automaticamente.`
    );
  }

  return {
    activities: uniqueActivities,
    dailyMetrics: Array.from(dailyMetricsByDate.values()),
    warnings,
    sourceLabel: `CSV (${fileName})`,
  };
}

export function buildCsvTemplateSample(): string {
  return [
    'data,atividade,tipo,duracao,distancia,calorias,passos,sono,fc_repouso,fc_media,fc_max,hrv',
    '2026-11-10,Corrida Matinal,Running,38,6.4,420,9850,7.5,56,154,176,68',
    '2026-11-11,Treino Força Superior,Strength,45,0,310,7400,7.2,57,128,152,65',
    '2026-11-12,Pedal Ritmo,Cycling,52,18.5,540,8100,8.0,55,146,169,72',
    '2026-11-13,Mobilidade e Caminhada,Walking,25,2.1,160,10400,7.8,54,108,124,74',
  ].join('\n');
}

// ============================================================================
// PARSER SAMSUNG HEALTH (Exportação oficial: Baixar dados pessoais CSV/JSON)
// ============================================================================

const SAMSUNG_EXERCISE_TYPE_MAP: Record<string, { sportType: string; labelPt: string }> = {
  '0': { sportType: 'Workout', labelPt: 'Treino Livre' },
  '1001': { sportType: 'Walking', labelPt: 'Caminhada' },
  '1002': { sportType: 'Running', labelPt: 'Corrida' },
  '1003': { sportType: 'Walking', labelPt: 'Caminhada Rápida' },
  '9001': { sportType: 'Strength', labelPt: 'Treino de Força' },
  '10001': { sportType: 'Pilates', labelPt: 'Pilates' },
  '10002': { sportType: 'Strength', labelPt: 'Musculação' },
  '10004': { sportType: 'Strength', labelPt: 'Supino / Força' },
  '10005': { sportType: 'Strength', labelPt: 'Agachamento' },
  '10006': { sportType: 'Strength', labelPt: 'Treino Funcional' },
  '10007': { sportType: 'HIIT', labelPt: 'Treino Intervalado (HIIT)' },
  '10008': { sportType: 'HIIT', labelPt: 'Circuito' },
  '11007': { sportType: 'Cycling', labelPt: 'Ciclismo' },
  '11008': { sportType: 'Cycling', labelPt: 'Bike Indoor' },
  '13001': { sportType: 'Yoga', labelPt: 'Yoga' },
  '13002': { sportType: 'Core', labelPt: 'Abdominais / Core' },
  '14001': { sportType: 'Swimming', labelPt: 'Natação' },
  '15001': { sportType: 'Hiking', labelPt: 'Trilha' },
  '15002': { sportType: 'Cardio', labelPt: 'Esteira' },
  '15003': { sportType: 'Cardio', labelPt: 'Elíptico' },
  '15005': { sportType: 'Cardio', labelPt: 'Remo' },
};

function splitCsvRow(line: string, delimiter: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  while (cols.length > 0 && cols[cols.length - 1] === '') {
    cols.pop();
  }
  return cols;
}

function parseSamsungTimestamp(raw: string | number | undefined | null): Date | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  if (/^\d{12,14}(\.\d+)?$/.test(str)) {
    const ms = Number(str);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{9,10}(\.\d+)?$/.test(str)) {
    const d = new Date(Number(str) * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const normalized = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function mapSamsungExerciseType(rawCodeOrName: string): {
  sportType: string;
  titlePt: string;
} {
  const trimmed = rawCodeOrName.trim();
  if (SAMSUNG_EXERCISE_TYPE_MAP[trimmed]) {
    return {
      sportType: SAMSUNG_EXERCISE_TYPE_MAP[trimmed].sportType,
      titlePt: SAMSUNG_EXERCISE_TYPE_MAP[trimmed].labelPt,
    };
  }
  const clean = trimmed.replace(/^com\.samsung\.(s?health)\./i, '').trim() || 'Treino';
  return {
    sportType: clean.slice(0, 60),
    titlePt: clean,
  };
}

export async function parseSamsungHealthFiles(
  files: File[],
  maxHr: number = 190,
  onProgress?: (percent: number) => void
): Promise<ParsedHealthImport> {
  if (files.length === 0) {
    throw new Error('Selecione ao menos um arquivo CSV ou JSON do Samsung Health.');
  }

  const warnings: string[] = [];
  const activities: Omit<HealthActivity, 'userId'>[] = [];

  const dailyBuckets: Record<
    string,
    {
      steps: number;
      hasAggregatedSteps: boolean;
      activeCalories: number;
      sleepHours: number;
      rhrSum: number;
      rhrCount: number;
      minHrDay: number | null;
      hrvSum: number;
      hrvCount: number;
      activeMinutes: number;
    }
  > = {};

  const ensureDay = (dateKey: string) => {
    if (!dailyBuckets[dateKey]) {
      dailyBuckets[dateKey] = {
        steps: 0,
        hasAggregatedSteps: false,
        activeCalories: 0,
        sleepHours: 0,
        rhrSum: 0,
        rhrCount: 0,
        minHrDay: null,
        hrvSum: 0,
        hrvCount: 0,
        activeMinutes: 0,
      };
    }
    return dailyBuckets[dateKey];
  };

  const hrStreamByRef = new Map<string, number[]>();
  const globalHrPoints: Array<{ ts: number; bpm: number }> = [];

  const csvFiles = files.filter((f) => f.name.toLowerCase().endsWith('.csv'));
  const jsonFiles = files.filter((f) => f.name.toLowerCase().endsWith('.json'));

  if (csvFiles.length === 0 && jsonFiles.length === 0) {
    throw new Error(
      'Nenhum arquivo .csv ou .json válido selecionado. Selecione arquivos extraídos do pacote Samsung Health.'
    );
  }

  const totalFiles = csvFiles.length + jsonFiles.length;
  let processedFiles = 0;
  const updateProgress = () => {
    processedFiles += 1;
    if (onProgress) {
      onProgress(Math.min(95, Math.round((processedFiles / totalFiles) * 95)));
    }
  };

  // 1. Ler primeiro os JSONs (séries de frequência cardíaca / live_data ou exports JSON diretos)
  for (const jf of jsonFiles) {
    try {
      const text = await jf.text();
      const parsed: unknown = JSON.parse(text);
      const refBase = jf.name.toLowerCase();

      const extractHrFromArray = (arr: unknown[]): number[] => {
        const hrs: number[] = [];
        for (const item of arr) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const hrVal = Number(
            rec.heart_rate ?? rec.heartRate ?? rec.bpm ?? rec.mean_heart_rate ?? 0
          );
          if (hrVal >= 35 && hrVal <= 235) {
            hrs.push(Math.round(hrVal));
            const dt = parseSamsungTimestamp(
              (rec.start_time ?? rec.time ?? rec.timestamp ?? rec.update_time) as
                | string
                | number
                | undefined
            );
            if (dt) {
              globalHrPoints.push({ ts: dt.getTime(), bpm: Math.round(hrVal) });
            }
          }
        }
        return hrs;
      };

      if (Array.isArray(parsed)) {
        const hrs = extractHrFromArray(parsed);
        if (hrs.length > 0) {
          hrStreamByRef.set(refBase, hrs);
          const uuidMatch = refBase.match(/[0-9a-f]{8}-[0-9a-f-]{12,}/i);
          if (uuidMatch) hrStreamByRef.set(uuidMatch[0], hrs);
        }

        // Verificar se o JSON também contém objetos completos de treino, passos ou sono
        for (let idx = 0; idx < parsed.length; idx++) {
          const entry = parsed[idx];
          if (!entry || typeof entry !== 'object') continue;
          const rec = entry as Record<string, unknown>;

          if (
            rec.exercise_type !== undefined ||
            (rec.duration !== undefined && (rec.calorie !== undefined || rec.distance !== undefined))
          ) {
            const startDt = parseSamsungTimestamp(
              (rec.start_time ?? rec.create_time) as string | number | undefined
            );
            if (!startDt) continue;
            const rawDur = Number(rec.duration ?? 0);
            const durationMin = Math.max(
              1,
              Math.round(rawDur > 1000 ? rawDur / 60000 : rawDur || 20)
            );
            const rawDist = Number(rec.distance ?? 0);
            const distanceKm = Number((rawDist > 100 ? rawDist / 1000 : rawDist).toFixed(2));
            const calories = Math.max(0, Math.round(Number(rec.calorie ?? rec.calories ?? durationMin * 7)));
            const avgHrRaw = Number(rec.mean_heart_rate ?? rec.avg_heart_rate ?? rec.heart_rate ?? 0);
            const maxHrRaw = Number(rec.max_heart_rate ?? 0);
            const avgHeartRate = avgHrRaw >= 30 && avgHrRaw <= 240 ? Math.round(avgHrRaw) : null;
            const maxHeartRate = maxHrRaw >= 30 && maxHrRaw <= 250 ? Math.round(maxHrRaw) : null;
            const mappedType = mapSamsungExerciseType(String(rec.exercise_type ?? 'Workout'));
            const dateKey = getLocalDateKey(startDt);
            const rawUuid =
              typeof rec.datauuid === 'string' && rec.datauuid.trim() ? rec.datauuid.trim() : '';
            const safeDuration = Math.min(1440, durationMin);
            const safeDistance = Math.min(1000, distanceKm);
            const externalId = rawUuid
              ? sanitizeId(`samsung_${rawUuid}`)
              : buildStableActivityId('samsung', {
                  dateKey,
                  startedAtKey: startDt.toISOString().slice(0, 16),
                  durationMinutes: safeDuration,
                  distanceKm: safeDistance,
                  sportType: mappedType.sportType,
                });

            activities.push({
              id: externalId,
              externalId,
              source: 'samsung_health',
              title: `Samsung Health · ${mappedType.titlePt}`.slice(0, 140),
              sportType: mappedType.sportType,
              dateKey,
              startedAt: startDt.toISOString(),
              durationMinutes: Math.min(1440, durationMin),
              distanceKm: Math.min(1000, distanceKm),
              calories: Math.min(20000, calories),
              elevationGainM: Math.min(20000, Math.max(0, Math.round(Number(rec.altitude_gain ?? 0)))),
              avgHeartRate,
              maxHeartRate,
              zoneMinutes: estimateZoneMinutesFromAvgHr(avgHeartRate, durationMin, maxHr),
              hrSamplePoints: [],
              xpAwarded: calculateActivityXp(durationMin, distanceKm, mappedType.sportType),
              createdAt: new Date().toISOString(),
            });
          } else if (rec.step_count !== undefined && rec.day_time !== undefined) {
            const dt = parseSamsungTimestamp(rec.day_time as string | number);
            if (!dt) continue;
            const dateKey = getLocalDateKey(dt);
            const bucket = ensureDay(dateKey);
            const stepsVal = Math.max(0, Math.round(Number(rec.step_count) || 0));
            const isAgg = Number(rec.source_type) === -2;
            if (isAgg || !bucket.hasAggregatedSteps) {
              bucket.steps = isAgg ? stepsVal : Math.max(bucket.steps, stepsVal);
              if (isAgg) bucket.hasAggregatedSteps = true;
            }
            bucket.activeCalories = Math.max(
              bucket.activeCalories,
              Math.round(Number(rec.calorie ?? 0))
            );
          } else if (rec.start_time !== undefined && rec.end_time !== undefined && rec.efficiency !== undefined) {
            const sDt = parseSamsungTimestamp(rec.start_time as string | number);
            const eDt = parseSamsungTimestamp(rec.end_time as string | number);
            if (sDt && eDt && eDt.getTime() > sDt.getTime()) {
              const hrs = (eDt.getTime() - sDt.getTime()) / 3600000;
              if (hrs > 0.2 && hrs <= 16) {
                ensureDay(getLocalDateKey(eDt)).sleepHours += hrs;
              }
            }
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const nested =
          (Array.isArray(obj.live_data) && obj.live_data) ||
          (Array.isArray(obj.binning_data) && obj.binning_data) ||
          (Array.isArray(obj.heart_rate) && obj.heart_rate) ||
          null;
        if (nested) {
          const hrs = extractHrFromArray(nested);
          if (hrs.length > 0) {
            hrStreamByRef.set(refBase, hrs);
          }
        }
      }
    } catch {
      warnings.push(`Não foi possível interpretar o arquivo JSON "${jf.name}".`);
    }
    updateProgress();
  }

  // 2. Ler CSVs oficiais do Samsung Health
  for (const cf of csvFiles) {
    try {
      const text = await cf.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        warnings.push(`Arquivo "${cf.name}" ignorado por não conter dados suficientes.`);
        updateProgress();
        continue;
      }

      const delimiter =
        lines[0].includes(';') && !lines[0].includes(',')
          ? ';'
          : lines[1] && lines[1].includes(';') && !lines[1].includes(',')
          ? ';'
          : ',';

      const line0Cols = splitCsvRow(lines[0], delimiter);
      const line1Cols = splitCsvRow(lines[1], delimiter);

      // Samsung Health coloca metadados na linha 1 (ex: "com.samsung.shealth.exercise,1,...")
      const isSamsungMetaRow =
        lines[0].toLowerCase().startsWith('com.samsung.') ||
        (line0Cols.length <= 4 && line1Cols.length >= 4) ||
        line1Cols.some((c) =>
          ['start_time', 'day_time', 'step_count', 'exercise_type', 'datauuid'].includes(
            c.toLowerCase()
          )
        );

      const headerLineIdx = isSamsungMetaRow ? 1 : 0;
      const dataStartIdx = headerLineIdx + 1;
      if (lines.length <= dataStartIdx) {
        updateProgress();
        continue;
      }

      const headers = splitCsvRow(lines[headerLineIdx], delimiter).map((h) =>
        h.toLowerCase().replace(/^["']|["']$/g, '')
      );
      const lowerFileName = cf.name.toLowerCase();

      const findExactOrAlias = (aliases: string[]): number => {
        for (const a of aliases) {
          const exactIdx = headers.findIndex((h) => h === a || h.endsWith(`.${a}`));
          if (exactIdx >= 0) return exactIdx;
        }
        return headers.findIndex((h) => aliases.some((a) => h.includes(a)));
      };

      const isExerciseCsv =
        lowerFileName.includes('exercise') ||
        headers.some((h) => h.includes('exercise_type'));
      const isPedometerCsv =
        lowerFileName.includes('pedometer') ||
        headers.some((h) => h.includes('step_count') || h.includes('healthy_step'));
      const isSleepCsv =
        lowerFileName.includes('sleep') ||
        (headers.some((h) => h.includes('efficiency')) &&
          headers.some((h) => h.includes('start_time')) &&
          !isExerciseCsv);
      const isHeartRateCsv =
        (lowerFileName.includes('heart_rate') || headers.some((h) => h === 'heart_rate')) &&
        !isExerciseCsv;
      const isHrvCsv =
        lowerFileName.includes('hrv') ||
        headers.some((h) => h === 'sdnn' || h === 'rmssd' || h === 'hrv');

      if (isExerciseCsv) {
        const colUuid = findExactOrAlias(['datauuid', 'uuid', 'id']);
        const colType = findExactOrAlias(['exercise_type', 'sport', 'tipo']);
        const colCustomTitle = findExactOrAlias(['custom_title', 'title', 'name', 'atividade']);
        const colStart = findExactOrAlias(['start_time', 'data', 'date']);
        const colEnd = findExactOrAlias(['end_time']);
        const colDuration = findExactOrAlias(['duration', 'duracao']);
        const colDistance = findExactOrAlias(['distance', 'distancia']);
        const colCalorie = findExactOrAlias(['calorie', 'calories', 'calorias']);
        const colAvgHr = findExactOrAlias(['mean_heart_rate', 'avg_heart_rate', 'heart_rate', 'fc_media']);
        const colMaxHr = findExactOrAlias(['max_heart_rate', 'fc_max']);
        const colElev = findExactOrAlias(['altitude_gain', 'elevation_gain', 'incline']);
        const colLiveData = findExactOrAlias(['live_data']);

        for (let r = dataStartIdx; r < lines.length; r++) {
          const cols = splitCsvRow(lines[r], delimiter);
          if (cols.length < 2) continue;

          const startDt =
            (colStart >= 0 ? parseSamsungTimestamp(cols[colStart]) : null) ?? null;
          if (!startDt) continue;

          const endDt = colEnd >= 0 ? parseSamsungTimestamp(cols[colEnd]) : null;
          const rawDur = colDuration >= 0 ? Number(cols[colDuration]) || 0 : 0;
          let durationMin =
            rawDur > 1000
              ? Math.round(rawDur / 60000)
              : rawDur > 0
              ? Math.round(rawDur)
              : endDt && endDt.getTime() > startDt.getTime()
              ? Math.round((endDt.getTime() - startDt.getTime()) / 60000)
              : 20;
          durationMin = Math.min(1440, Math.max(1, durationMin));

          const rawDist = colDistance >= 0 ? Number(cols[colDistance]) || 0 : 0;
          const distanceHeader = colDistance >= 0 ? headers[colDistance] : '';
          const distanceKm = Number(
            (
              distanceHeader.includes('km')
                ? rawDist
                : isSamsungMetaRow || rawDist > 80
                ? rawDist / 1000
                : rawDist
            ).toFixed(2)
          );

          const rawCal = colCalorie >= 0 ? Number(cols[colCalorie]) || 0 : 0;
          const calories = Math.min(20000, Math.max(0, Math.round(rawCal || durationMin * 7)));
          const avgHrRaw = colAvgHr >= 0 ? Number(cols[colAvgHr]) : NaN;
          const maxHrRaw = colMaxHr >= 0 ? Number(cols[colMaxHr]) : NaN;
          const avgHeartRate =
            !Number.isNaN(avgHrRaw) && avgHrRaw >= 30 && avgHrRaw <= 240
              ? Math.round(avgHrRaw)
              : null;
          const maxHeartRate =
            !Number.isNaN(maxHrRaw) && maxHrRaw >= 30 && maxHrRaw <= 250
              ? Math.round(maxHrRaw)
              : null;
          const elevationGainM =
            colElev >= 0 ? Math.min(20000, Math.max(0, Math.round(Number(cols[colElev]) || 0))) : 0;

          const mappedType = mapSamsungExerciseType(
            (colType >= 0 ? cols[colType] : '') || '0'
          );
          const customTitle = colCustomTitle >= 0 ? cols[colCustomTitle] : '';
          const title = customTitle
            ? `Samsung Health · ${customTitle}`
            : `Samsung Health · ${mappedType.titlePt}`;

          const dateKey = getLocalDateKey(startDt);
          const rawUuid = colUuid >= 0 && cols[colUuid] ? cols[colUuid].trim() : '';
          const liveDataRef = colLiveData >= 0 ? cols[colLiveData]?.toLowerCase() : '';
          const matchedJsonHr =
            (liveDataRef && hrStreamByRef.get(liveDataRef)) ||
            (rawUuid ? hrStreamByRef.get(rawUuid.toLowerCase()) : undefined) ||
            [];

          const zoneMinutes =
            matchedJsonHr.length > 0
              ? computeZoneMinutesFromHrStream(matchedJsonHr, durationMin, maxHr)
              : estimateZoneMinutesFromAvgHr(avgHeartRate, durationMin, maxHr);

          const safeDistKm = Math.min(1000, Math.max(0, distanceKm));
          const externalId = rawUuid
            ? sanitizeId(`samsung_${rawUuid}`)
            : buildStableActivityId('samsung', {
                dateKey,
                startedAtKey: startDt.toISOString().slice(0, 16),
                durationMinutes: durationMin,
                distanceKm: safeDistKm,
                sportType: mappedType.sportType,
              });
          activities.push({
            id: externalId,
            externalId,
            source: 'samsung_health',
            title: title.slice(0, 140),
            sportType: mappedType.sportType,
            dateKey,
            startedAt: startDt.toISOString(),
            durationMinutes: durationMin,
            distanceKm: Math.min(1000, Math.max(0, distanceKm)),
            calories,
            elevationGainM,
            avgHeartRate,
            maxHeartRate,
            zoneMinutes,
            hrSamplePoints: downsampleArray(matchedJsonHr, 40),
            xpAwarded: calculateActivityXp(durationMin, distanceKm, mappedType.sportType),
            createdAt: new Date().toISOString(),
          });
        }
      } else if (isPedometerCsv) {
        const colDay = findExactOrAlias(['day_time', 'start_time', 'date', 'data']);
        const colSteps = findExactOrAlias(['step_count', 'steps', 'passos']);
        const colCal = findExactOrAlias(['calorie', 'calories', 'calorias']);
        const colActiveTime = findExactOrAlias(['active_time', 'duration']);
        const colSourceType = findExactOrAlias(['source_type']);

        for (let r = dataStartIdx; r < lines.length; r++) {
          const cols = splitCsvRow(lines[r], delimiter);
          const dt = colDay >= 0 ? parseSamsungTimestamp(cols[colDay]) : null;
          if (!dt) continue;

          const dateKey = getLocalDateKey(dt);
          const bucket = ensureDay(dateKey);
          const stepsVal = colSteps >= 0 ? Math.max(0, Math.round(Number(cols[colSteps]) || 0)) : 0;
          const calVal = colCal >= 0 ? Math.max(0, Math.round(Number(cols[colCal]) || 0)) : 0;
          const activeRaw = colActiveTime >= 0 ? Number(cols[colActiveTime]) || 0 : 0;
          const activeMin = activeRaw > 1000 ? Math.round(activeRaw / 60000) : Math.round(activeRaw);
          const isAggregated = colSourceType >= 0 && Number(cols[colSourceType]) === -2;

          if (isAggregated) {
            bucket.steps = Math.min(200000, stepsVal);
            bucket.hasAggregatedSteps = true;
            bucket.activeCalories = Math.max(bucket.activeCalories, Math.min(20000, calVal));
            bucket.activeMinutes = Math.max(bucket.activeMinutes, activeMin);
          } else if (!bucket.hasAggregatedSteps) {
            bucket.steps = Math.min(200000, Math.max(bucket.steps, stepsVal));
            bucket.activeCalories = Math.max(bucket.activeCalories, Math.min(20000, calVal));
            bucket.activeMinutes = Math.max(bucket.activeMinutes, activeMin);
          }
        }
      } else if (isSleepCsv) {
        const colStart = findExactOrAlias(['start_time', 'bed_time']);
        const colEnd = findExactOrAlias(['end_time', 'wake_time']);
        const colDur = findExactOrAlias(['sleep_duration', 'duration']);

        for (let r = dataStartIdx; r < lines.length; r++) {
          const cols = splitCsvRow(lines[r], delimiter);
          const startDt = colStart >= 0 ? parseSamsungTimestamp(cols[colStart]) : null;
          const endDt = colEnd >= 0 ? parseSamsungTimestamp(cols[colEnd]) : null;
          let hrs = 0;

          if (startDt && endDt && endDt.getTime() > startDt.getTime()) {
            hrs = (endDt.getTime() - startDt.getTime()) / 3600000;
          } else if (colDur >= 0) {
            const raw = Number(cols[colDur]) || 0;
            hrs = raw > 1000 ? raw / 3600000 : raw > 24 ? raw / 60 : raw;
          }

          const refDt = endDt ?? startDt;
          if (refDt && hrs > 0.2 && hrs <= 16) {
            ensureDay(getLocalDateKey(refDt)).sleepHours += hrs;
          }
        }
      } else if (isHeartRateCsv) {
        const colStart = findExactOrAlias(['start_time', 'time', 'date', 'data']);
        const colHr = findExactOrAlias(['heart_rate', 'bpm', 'resting_hr']);
        const colMinHr = findExactOrAlias(['min', 'min_heart_rate', 'resting']);

        for (let r = dataStartIdx; r < lines.length; r++) {
          const cols = splitCsvRow(lines[r], delimiter);
          const dt = colStart >= 0 ? parseSamsungTimestamp(cols[colStart]) : null;
          if (!dt) continue;

          const dateKey = getLocalDateKey(dt);
          const hrVal = colHr >= 0 ? Number(cols[colHr]) : NaN;
          const minVal = colMinHr >= 0 ? Number(cols[colMinHr]) : NaN;

          if (!Number.isNaN(hrVal) && hrVal >= 35 && hrVal <= 235) {
            globalHrPoints.push({ ts: dt.getTime(), bpm: Math.round(hrVal) });
            const bucket = ensureDay(dateKey);
            if (hrVal <= 95) {
              bucket.minHrDay =
                bucket.minHrDay === null ? Math.round(hrVal) : Math.min(bucket.minHrDay, Math.round(hrVal));
            }
          }
          if (!Number.isNaN(minVal) && minVal >= 30 && minVal <= 140) {
            const bucket = ensureDay(dateKey);
            bucket.rhrSum += minVal;
            bucket.rhrCount += 1;
          }
        }
      } else if (isHrvCsv) {
        const colStart = findExactOrAlias(['start_time', 'time', 'date', 'data']);
        const colHrv = findExactOrAlias(['sdnn', 'rmssd', 'hrv']);

        for (let r = dataStartIdx; r < lines.length; r++) {
          const cols = splitCsvRow(lines[r], delimiter);
          const dt = colStart >= 0 ? parseSamsungTimestamp(cols[colStart]) : null;
          const hrvVal = colHrv >= 0 ? Number(cols[colHrv]) : NaN;
          if (dt && !Number.isNaN(hrvVal) && hrvVal >= 5 && hrvVal <= 300) {
            const bucket = ensureDay(getLocalDateKey(dt));
            bucket.hrvSum += hrvVal;
            bucket.hrvCount += 1;
          }
        }
      } else {
        // Fallback genérico para CSV simplificado compatível com Samsung Health
        const parsedFallback = parseCsvHealthContent(text, cf.name, maxHr);
        for (const a of parsedFallback.activities) {
          activities.push({ ...a, source: 'samsung_health' });
        }
        for (const m of parsedFallback.dailyMetrics) {
          const b = ensureDay(m.dateKey);
          b.steps = Math.max(b.steps, m.steps);
          b.activeCalories = Math.max(b.activeCalories, m.activeCalories);
          if (m.sleepHours > 0) b.sleepHours = Math.max(b.sleepHours, m.sleepHours);
          if (m.restingHeartRate !== null) {
            b.rhrSum += m.restingHeartRate;
            b.rhrCount += 1;
          }
          if (m.hrvMs !== null) {
            b.hrvSum += m.hrvMs;
            b.hrvCount += 1;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido';
      warnings.push(`Falha ao ler "${cf.name}": ${msg}`);
    }
    updateProgress();
  }

  // 3. Enriquecer atividades Samsung Health com amostras de FC coletadas na mesma janela
  if (globalHrPoints.length > 0) {
    for (const act of activities) {
      if (act.hrSamplePoints.length > 0) continue;
      const startMs = new Date(act.startedAt).getTime();
      const endMs = startMs + act.durationMinutes * 60000;
      const matched = globalHrPoints
        .filter((p) => p.ts >= startMs - 60000 && p.ts <= endMs + 60000)
        .map((p) => p.bpm);

      if (matched.length > 0) {
        act.avgHeartRate = Math.round(matched.reduce((a, b) => a + b, 0) / matched.length);
        act.maxHeartRate = Math.round(Math.max(...matched));
        act.zoneMinutes = computeZoneMinutesFromHrStream(matched, act.durationMinutes, maxHr);
        act.hrSamplePoints = downsampleArray(matched, 40);
      }
    }
  }

  // Ordenar mais recentes primeiro e deduplicar intra-lote por externalId
  const { unique: uniqueActivities, intraDuplicates } = deduplicateParsedActivities(activities);
  uniqueActivities.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (intraDuplicates > 0) {
    warnings.push(
      `${intraDuplicates} atividade(s) duplicada(s) nos arquivos Samsung Health foram ignoradas automaticamente.`
    );
  }

  const dailyMetrics: Omit<DailyHealthMetric, 'userId'>[] = Object.entries(dailyBuckets)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 120)
    .map(([dateKey, b]) => {
      const rhr =
        b.rhrCount > 0
          ? Math.round(b.rhrSum / b.rhrCount)
          : b.minHrDay !== null && b.minHrDay >= 30 && b.minHrDay <= 140
          ? b.minHrDay
          : null;
      const hrv = b.hrvCount > 0 ? Math.round(b.hrvSum / b.hrvCount) : null;
      const sleepHours = Number(Math.min(16, b.sleepHours).toFixed(1));
      const trainingLoadScore = Math.min(
        2000,
        Math.max(Math.round(b.activeCalories / 10), b.activeMinutes * 2)
      );

      return {
        id: dateKey,
        dateKey,
        steps: Math.min(200000, b.steps),
        activeCalories: Math.min(20000, b.activeCalories),
        sleepHours,
        restingHeartRate: rhr,
        hrvMs: hrv,
        trainingLoadScore,
        recoveryScore: sleepHours >= 7 ? 85 : sleepHours > 0 ? 70 : 75,
        sources: ['samsung_health'],
        updatedAt: new Date().toISOString(),
      };
    });

  if (uniqueActivities.length === 0 && dailyMetrics.length === 0) {
    warnings.push(
      'Nenhum treino ou métrica reconhecida nos arquivos selecionados. Verifique se enviou os arquivos CSV/JSON exportados pelo Samsung Health.'
    );
  }

  if (onProgress) onProgress(100);

  return {
    activities: uniqueActivities,
    dailyMetrics,
    warnings,
    sourceLabel: `Samsung Health (${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'})`,
  };
}

export function buildSamsungHealthSampleCsv(): string {
  const now = new Date();
  const formatOffsetDate = (daysAgo: number, hour: number): string => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, 30, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day} ${String(hour).padStart(2, '0')}:30:00.000`;
  };

  return [
    'com.samsung.shealth.exercise,1,1,0',
    'datauuid,exercise_type,custom_title,start_time,duration,distance,calorie,mean_heart_rate,max_heart_rate,altitude_gain',
    `sh-sample-1,1002,Corrida Parque,${formatOffsetDate(3, 7)},2400000,6800,455,156,178,42`,
    `sh-sample-2,9001,Força Superior,${formatOffsetDate(2, 18)},2700000,0,320,126,149,0`,
    `sh-sample-3,11007,Pedal Urbano,${formatOffsetDate(1, 7)},3300000,19400,560,144,167,115`,
    `sh-sample-4,1001,Caminhada Leve,${formatOffsetDate(0, 8)},1800000,2600,145,104,118,12`,
  ].join('\n');
}
