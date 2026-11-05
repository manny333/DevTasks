import type { DuePreset } from '../types';

/** Local calendar date (YYYY-MM-DD); toISOString() would shift the day east of UTC. */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Date range (inclusive) for a due-date filter preset. */
export function getDueDateRange(preset: DuePreset): { from: string | null; to: string | null } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'overdue': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: null, to: toLocalDateString(yesterday) };
    }
    case 'today':
      return { from: toLocalDateString(today), to: toLocalDateString(today) };
    case 'week': {
      const endOfWeek = new Date(today);
      const dayOfWeek = today.getDay();
      const daysUntilEnd = 7 - dayOfWeek;
      endOfWeek.setDate(endOfWeek.getDate() + daysUntilEnd);
      return { from: toLocalDateString(today), to: toLocalDateString(endOfWeek) };
    }
    default:
      return { from: null, to: null };
  }
}
