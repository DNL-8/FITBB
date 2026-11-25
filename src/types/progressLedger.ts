export type ProgressEntryKind =
  | 'workout'
  | 'health_activity'
  | 'armory_purchase'
  | 'daily_quest'
  | 'vow_completed'
  | 'vow_broken'
  | 'adjustment';

export interface ProgressLedgerEntry {
  id: string;
  userId: string;
  kind: ProgressEntryKind;
  title: string;
  createdAt: string;
  xpDelta: number;
  coinDelta: number;
  totalXp: number;
  goldCoins: number;
}

export interface ProgressLedgerPage {
  available: boolean;
  entries: ProgressLedgerEntry[];
  nextCursor: string | null;
}
