import { useCallback } from 'react';
import type { User } from 'firebase/auth';
import { ApiServiceError, api } from '../../services/api';
import type { DailyHealthMetric, HealthActivity, HealthImportBatchResult, HealthImportProgress } from '../../types/fitness';
import { getFriendlyErrorMessage } from '../../utils/errors';
import { MAX_IMPORT_ACTIVITIES_PER_ROUND } from '../../utils/rpgLogic';

export function useHealthImport(authUser: User, healthActivities: HealthActivity[]) {
  return useCallback(
    async (
      incomingActivities: Omit<HealthActivity, 'userId'>[],
      incomingMetrics: Omit<DailyHealthMetric, 'userId'>[],
      options?: {
        onProgress?: (progress: HealthImportProgress) => void;
      }
    ): Promise<HealthImportBatchResult> => {
      const totalOriginalActivities = incomingActivities.length;
      const truncatedOverLimit = totalOriginalActivities > MAX_IMPORT_ACTIVITIES_PER_ROUND;
      const activitiesRound = incomingActivities.slice(0, MAX_IMPORT_ACTIVITIES_PER_ROUND);

      const knownExternalIds = new Set(healthActivities.map((activity) => JSON.stringify([activity.source, activity.externalId || activity.id])));
      const seenBatchIds = new Set<string>();

      let importedActivities = 0;
      let skippedDuplicates = 0;
      let errorCount = 0;
      let importedDays = 0;
      let xpAdded = 0;
      let lastError: string | null = null;

      const completedExternalIds: string[] = [];
      const completedMetricDates: string[] = [];
      const failedActivities: HealthImportBatchResult['failedActivities'] = [];
      const failedMetrics: HealthImportBatchResult['failedMetrics'] = [];

      const emitProgress = (
        phase: HealthImportProgress['phase'],
        processedActivities: number,
        processedMetrics: number,
        currentLabel: string
      ) => {
        options?.onProgress?.({
          phase,
          processedActivities,
          totalActivities: activitiesRound.length,
          processedMetrics,
          totalMetrics: incomingMetrics.length,
          importedActivities,
          skippedDuplicates,
          errorCount,
          xpAdded,
          currentLabel,
        });
      };

      const isFatalBatchError = (err: unknown): boolean => {
        if (err instanceof ApiServiceError) {
          return err.status === 401 || err.status === 403 || err.status >= 500;
        }
        return err instanceof TypeError;
      };

      emitProgress(
        activitiesRound.length > 0 ? 'activities' : 'metrics',
        0,
        0,
        activitiesRound.length > 0
          ? 'Iniciando envio sequencial das atividades...'
          : 'Atualizando métricas diárias...'
      );

      let abortedByFatal = false;

      // 1. Gravar UMA atividade por vez (sequencial, sem Promise.all)
      for (let i = 0; i < activitiesRound.length; i++) {
        const act = activitiesRound[i];
        const extId = act.externalId || act.id;
        const identity = JSON.stringify([act.source, extId]);

        if (knownExternalIds.has(identity) || seenBatchIds.has(identity)) {
          skippedDuplicates += 1;
          completedExternalIds.push(extId);
          emitProgress(
            'activities',
            i + 1,
            0,
            `Duplicidade ignorada: ${act.title}`
          );
          continue;
        }

        seenBatchIds.add(identity);

        try {
          const res = await api.health.logActivity(
            {
              id: act.id,
              externalId: extId,
              source: act.source,
              title: act.title,
              sportType: act.sportType,
              dateKey: act.dateKey,
              startedAt: act.startedAt,
              durationMinutes: act.durationMinutes,
              distanceKm: act.distanceKm,
              calories: act.calories,
              elevationGainM: act.elevationGainM,
              avgHeartRate: act.avgHeartRate,
              maxHeartRate: act.maxHeartRate,
              zoneMinutes: act.zoneMinutes,
              hrSamplePoints: act.hrSamplePoints,
            },
            authUser
          );

          knownExternalIds.add(identity);
          completedExternalIds.push(extId);

          if (res.duplicate) {
            skippedDuplicates += 1;
          } else {
            importedActivities += 1;
            xpAdded += res.activity.xpAwarded;
          }

          emitProgress(
            'activities',
            i + 1,
            0,
            res.duplicate
              ? `Duplicidade no servidor: ${act.title}`
              : `Salvo (${i + 1}/${activitiesRound.length}): ${act.title}`
          );
        } catch (err: unknown) {
          const msg = getFriendlyErrorMessage(err);
          lastError = msg;

          if (isFatalBatchError(err)) {
            // Interrompe imediatamente e preserva esta atividade + pendentes para retomada
            for (let rem = i; rem < activitiesRound.length; rem++) {
              const remAct = activitiesRound[rem];
              const remId = remAct.externalId || remAct.id;
              if (knownExternalIds.has(remId) || seenBatchIds.has(remId) && rem > i) {
                skippedDuplicates += 1;
                completedExternalIds.push(remId);
              } else {
                errorCount += 1;
                failedActivities.push({ activity: remAct, error: msg });
              }
            }
            for (const m of incomingMetrics) {
              failedMetrics.push({ metric: m, error: msg });
            }
            abortedByFatal = true;
            emitProgress('done', activitiesRound.length, 0, msg);
            break;
          }

          errorCount += 1;
          failedActivities.push({ activity: act, error: msg });
          emitProgress('activities', i + 1, 0, `Erro em "${act.title}": ${msg}`);
        }
      }

      // 2. Gravar métricas diárias sequencialmente via /api/v1/health-data/metrics
      if (!abortedByFatal) {
        for (let i = 0; i < incomingMetrics.length; i++) {
          const m = incomingMetrics[i];
          try {
            await api.health.logMetrics(
              {
                dateKey: m.dateKey,
                steps: m.steps,
                activeCalories: m.activeCalories,
                sleepHours: m.sleepHours,
                restingHeartRate: m.restingHeartRate,
                hrvMs: m.hrvMs,
                trainingLoadScore: m.trainingLoadScore,
                recoveryScore: m.recoveryScore,
                sources: m.sources,
              },
              authUser
            );
            importedDays += 1;
            completedMetricDates.push(m.dateKey);
            emitProgress(
              'metrics',
              activitiesRound.length,
              i + 1,
              `Métrica diária salva (${m.dateKey})`
            );
          } catch (err: unknown) {
            const msg = getFriendlyErrorMessage(err);
            lastError = msg;

            if (isFatalBatchError(err)) {
              for (let rem = i; rem < incomingMetrics.length; rem++) {
                errorCount += 1;
                failedMetrics.push({ metric: incomingMetrics[rem], error: msg });
              }
              emitProgress('done', activitiesRound.length, incomingMetrics.length, msg);
              break;
            }

            errorCount += 1;
            failedMetrics.push({ metric: m, error: msg });
            emitProgress(
              'metrics',
              activitiesRound.length,
              i + 1,
              `Erro na métrica ${m.dateKey}: ${msg}`
            );
          }
        }
      }

      emitProgress('done', activitiesRound.length, incomingMetrics.length, 'Importação finalizada');

      return {
        importedActivities,
        skippedDuplicates,
        errorCount,
        importedDays,
        xpAdded,
        truncatedOverLimit,
        totalOriginalActivities,
        completedExternalIds,
        completedMetricDates,
        failedActivities,
        failedMetrics,
        lastError,
      };
    },
    [authUser, healthActivities]
  );
}
