import type { WorkoutLog } from '../types/fitness.ts';

interface HistoryPage {
  logs: WorkoutLog[];
  order: 'completedAt' | 'documentId';
  nextCursor: string | null;
}

const RECENT_HISTORY_LIMIT = 300;

export async function readRecentWorkoutLogs(
  loadPage: (limit: number, cursor?: string) => Promise<HistoryPage>,
  signal?: AbortSignal
): Promise<WorkoutLog[]> {
  let recent: WorkoutLog[] = [];
  let cursor: string | undefined;

  do {
    signal?.throwIfAborted();
    const page = await loadPage(200, cursor);
    // Without the date index, the newest log can be anywhere in the document-ID order.
    recent = [...recent, ...page.logs]
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.id.localeCompare(a.id))
      .slice(0, RECENT_HISTORY_LIMIT);
    cursor = page.nextCursor ?? undefined;
    if (page.order === 'completedAt' && recent.length >= RECENT_HISTORY_LIMIT) break;
  } while (cursor !== undefined);

  return recent;
}
