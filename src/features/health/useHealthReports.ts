import { useEffect, useMemo, useState } from 'react';
import { collection, documentId, endAt, limit, onSnapshot, orderBy, query, startAt, where, type QueryConstraint } from 'firebase/firestore';
import { db } from '../../firebase';
import type { HealthConnectReadStatus } from '../../services/api';
import type { DailyHealthMetric, HealthActivity } from '../../types/fitness';
import { projectHealthConnect, type HealthConnectRecord } from '../../utils/healthConnect';

export function useHealthReports(uid: string, enabled: boolean, activities: HealthActivity[], metrics: DailyHealthMetric[]) {
  const [records, setRecords] = useState<HealthConnectRecord[]>([]);
  const [healthConnectStatus, setHealthConnectStatus] = useState<HealthConnectReadStatus | 'loading'>('loading');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const unsubscribe: Array<() => void> = [];
    const sections = new Map<string, HealthConnectRecord[]>();
    const status = new Map<string, boolean>();
    const owned = query(collection(db, 'users', uid, 'healthConnectRecords'), where('userId', '==', uid));
    setRecords([]);
    setHealthConnectStatus('loading');

    const mark = (section: string, available: boolean) => {
      status.set(section, available);
      if (status.size !== 3) return;
      const readable = [...status.values()].filter(Boolean).length;
      setHealthConnectStatus(readable === 3 ? 'available' : readable === 0 ? 'unavailable' : 'partial');
    };
    const subscribe = (section: string, constraints: QueryConstraint[], fallback?: QueryConstraint[]) => {
      unsubscribe.push(onSnapshot(query(owned, ...constraints), { includeMetadataChanges: true }, (snapshot) => {
        if (!active) return;
        sections.set(section, snapshot.docs.map((entry) => entry.data() as HealthConnectRecord));
        setRecords([...sections.values()].flat());
        if (!snapshot.metadata.fromCache) mark(section, true);
      }, (error) => {
        if (!active) return;
        if (fallback && error.code === 'failed-precondition') subscribe(section, fallback);
        else mark(section, false);
      }));
    };
    subscribe('totals', [orderBy(documentId(), 'desc'), startAt('hc_daily_\uf8ff'), endAt('hc_daily_'), limit(90)]);
    for (const [type, maximum] of [['exercise', 120], ['heart_rate', 150]] as const) {
      subscribe(type, [where('type', '==', type), orderBy('startTime', 'desc'), limit(maximum)],
        [where('type', '==', type), orderBy(documentId(), 'desc'), limit(maximum)]);
    }
    return () => {
      active = false;
      unsubscribe.forEach((stop) => stop());
    };
  }, [enabled, uid]);

  const healthReports = useMemo(() => enabled
    ? projectHealthConnect(records, activities, metrics, uid, Intl.DateTimeFormat().resolvedOptions().timeZone)
    : null, [enabled, records, activities, metrics, uid]);
  return { healthConnectStatus, healthReports };
}
