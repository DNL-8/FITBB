import { randomUUID } from 'node:crypto';
import type { GameStats } from '../../types/fitness.ts';
import type { ProgressEntryKind, ProgressLedgerEntry, ProgressLedgerPage } from '../../types/progressLedger.ts';
import { ApiHttpError, firestoreRest, type VerifiedFirebaseUser } from '../firebaseRest.ts';

const PAGE_SIZE = 30;
const ENTRY_ID = /^\d{17}_[0-9a-f-]{36}$/;
type ProgressBalance = Pick<GameStats, 'totalXp' | 'goldCoins' | 'updatedAt'>;
type ProgressWrites = Parameters<typeof firestoreRest.commitWrites>[1];

async function canAccessLedger(user: VerifiedFirebaseUser): Promise<boolean> {
  try {
    // An absent document returns 404 when the owner's read rule is active.
    await firestoreRest.getDoc(user.token, `users/${user.uid}/progressLedger/availability`);
    return true;
  } catch (error) {
    if (error instanceof ApiHttpError && error.statusCode === 403) return false;
    throw error;
  }
}

export async function commitProgressChange(
  user: VerifiedFirebaseUser,
  before: ProgressBalance,
  after: ProgressBalance,
  reason: { kind: ProgressEntryKind; title: string },
  writes: ProgressWrites,
): Promise<void> {
  const goldCoins = after.goldCoins ?? 50;
  const xpDelta = after.totalXp - before.totalXp;
  const coinDelta = goldCoins - (before.goldCoins ?? 50);
  if (xpDelta === 0 && coinDelta === 0) {
    await firestoreRest.commitWrites(user.token, writes);
    return;
  }

  const entry: ProgressLedgerEntry = {
    id: `${after.updatedAt.replace(/\D/g, '')}_${randomUUID()}`,
    userId: user.uid,
    kind: reason.kind,
    title: reason.title.trim().slice(0, 140) || 'Alteração de progresso',
    createdAt: after.updatedAt,
    xpDelta,
    coinDelta,
    totalXp: after.totalXp,
    goldCoins,
  };
  try {
    await firestoreRest.commitWrites(user.token, [...writes, {
      type: 'set',
      path: `users/${user.uid}/progressLedger/${entry.id}`,
      data: { ...entry },
      precondition: { exists: false },
    }]);
  } catch (error) {
    if (!(error instanceof ApiHttpError) || error.statusCode !== 403 || await canAccessLedger(user)) {
      throw error;
    }
    // Unpublished rules deny the entire first commit. The original preconditions still apply.
    await firestoreRest.commitWrites(user.token, writes);
  }
}

export async function readProgressLedger(user: VerifiedFirebaseUser, cursor?: string): Promise<ProgressLedgerPage> {
  if (cursor !== undefined && !ENTRY_ID.test(cursor)) {
    throw new ApiHttpError(400, 'Cursor do extrato inválido.', 'invalid_progress_ledger_cursor');
  }
  try {
    const items = await firestoreRest.queryByUser<ProgressLedgerEntry>(
      user.token, user.uid, 'progressLedger', PAGE_SIZE + 1, { afterId: cursor }
    );
    const entries = items.slice(0, PAGE_SIZE);
    return { available: true, entries, nextCursor: items.length > PAGE_SIZE ? entries.at(-1)!.id : null };
  } catch (error) {
    if (!(error instanceof ApiHttpError) || error.statusCode !== 403 || await canAccessLedger(user)) throw error;
    return { available: false, entries: [], nextCursor: null };
  }
}
