import type { DailyHealthMetric, HealthActivity } from '../types/fitness.ts';

export interface HealthConnectRecord {
  userId: string;
  recordId: string;
  type: 'steps' | 'calories' | 'exercise' | 'heart_rate';
  startTime: string;
  endTime: string;
  values: Record<string, unknown>;
  updatedAt: number;
}

export interface HealthConnectDay {
  dateKey: string;
  steps?: number;
  totalCalories?: number;
}

export function projectHealthConnect(
  records: HealthConnectRecord[],
  activities: HealthActivity[],
  metrics: DailyHealthMetric[],
  uid: string,
  timeZone: string
) {
  const daily = new Map<string, HealthConnectDay>();
  const timestamps = new Map<number, number>();
  const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone });
  const combinedActivities = [...activities];
  const dailyMetrics = new Map(metrics.map((metric) => [metric.dateKey, metric]));
  const seenExercises = new Set<string>();
  let latestRecordUpdate = 0;
  let latestHeartRate: { time: string; beatsPerMinute: number } | null = null;

  for (const record of records) {
    if (record.userId !== uid || !record.values || typeof record.recordId !== 'string') continue;
    if (Number.isFinite(record.updatedAt) && record.updatedAt > latestRecordUpdate && record.updatedAt <= 8.64e15) {
      latestRecordUpdate = record.updatedAt;
    }
    const dailyId = /^hc_daily_(\d{4}-\d{2}-\d{2})_(steps|calories)$/.exec(record.recordId);
    if (dailyId && dailyId[2] === record.type) {
      const dateKey = dailyId[1];
      const metric = daily.get(dateKey) ?? { dateKey };
      if (record.type === 'steps' && typeof record.values.count === 'number' &&
          Number.isFinite(record.values.count) && record.values.count >= 0) {
        metric.steps = record.values.count;
      }
      if (record.type === 'calories' && typeof record.values.kilocalories === 'number' &&
          Number.isFinite(record.values.kilocalories) && record.values.kilocalories >= 0) {
        metric.totalCalories = record.values.kilocalories;
      }
      daily.set(dateKey, metric);
    }
    if (record.type !== 'heart_rate' || !Array.isArray(record.values.samples)) continue;
    const samples = record.values.samples.slice(0, 10_000);
    const sampleStride = Math.max(1, Math.ceil(samples.length / 240));
    for (let index = 0; index < samples.length; index += sampleStride) {
      const sample = samples[Math.min(samples.length - 1, index + sampleStride - 1)];
      if (typeof sample?.time !== 'string' || !Number.isFinite(sample.beatsPerMinute) ||
          sample.beatsPerMinute < 30 || sample.beatsPerMinute > 250) continue;
      const epoch = Date.parse(sample.time);
      if (!Number.isFinite(epoch)) continue;
      const bpm = Math.max(timestamps.get(epoch) ?? 0, sample.beatsPerMinute);
      timestamps.set(epoch, bpm);
    }
  }

  const heartRates = [...timestamps.entries()].sort(([a], [b]) => a - b);
  const latest = heartRates.at(-1);
  if (latest) latestHeartRate = { time: new Date(latest[0]).toISOString(), beatsPerMinute: latest[1] };
  for (const record of records) {
    if (record.userId !== uid || record.type !== 'exercise' || !record.values ||
        typeof record.recordId !== 'string') continue;
    const start = Date.parse(record.startTime);
    const end = Date.parse(record.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const durationMinutes = Math.max(1, Math.round((end - start) / 60_000));
    const title = typeof record.values.title === 'string' && record.values.title.trim()
      ? record.values.title.trim() : 'Exercício do Health Connect';
    const id = `health-connect-${record.recordId}`;
    const exerciseKey = `${start}:${end}:${String(record.values.exerciseType)}`;
    if (seenExercises.has(exerciseKey) || combinedActivities.some((activity) =>
      activity.externalId === id ||
      (Date.parse(activity.startedAt) === start && activity.durationMinutes === durationMinutes)
    )) continue;
    seenExercises.add(exerciseKey);
    const beats = heartRates.filter(([time]) => time >= start && time < end).map(([, bpm]) => bpm);
    const sampleStride = Math.max(1, Math.ceil(beats.length / 40));
    combinedActivities.push({
      id, userId: uid, externalId: id, source: 'health_connect', title,
      sportType: title,
      dateKey: dateFormatter.format(start),
      startedAt: new Date(start).toISOString(),
      durationMinutes,
      distanceKm: 0, calories: 0, elevationGainM: 0, xpAwarded: 0,
      avgHeartRate: beats.length ? Math.round(beats.reduce((total, bpm) => total + bpm, 0) / beats.length) : null,
      maxHeartRate: beats.length ? beats.reduce((highest, bpm) => Math.max(highest, bpm), 0) : null,
      zoneMinutes: [0, 0, 0, 0, 0],
      hrSamplePoints: beats.filter((_, index) => index % sampleStride === 0),
      createdAt: new Date(start).toISOString(),
    });
  }

  for (const { dateKey, steps } of daily.values()) {
    if (steps === undefined) continue;
    const existing = dailyMetrics.get(dateKey);
    dailyMetrics.set(dateKey, {
      id: dateKey, userId: uid, dateKey,
      activeCalories: 0, sleepHours: 0, restingHeartRate: null, hrvMs: null,
      trainingLoadScore: 0, recoveryScore: 0, updatedAt: '',
      ...existing,
      steps: Math.max(existing?.steps ?? 0, steps),
      sources: [...new Set([...(existing?.sources ?? []), 'health_connect'])],
    });
  }

  return {
    activities: combinedActivities,
    metrics: [...dailyMetrics.values()],
    days: [...daily.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey)),
    latestHeartRate,
    latestRecordUpdate: latestRecordUpdate || null,
  };
}
