import { addDays, todayISO } from '@/lib/date';

export type Predecessor = { id: string; title: string; scheduled_date: string | null; completed: boolean };
export type DependencyInfo = { successor_id: string; lag_days: number; predecessor: Predecessor | null };
export function dependencyStatus(date: string | null, dependencies: DependencyInfo[]) {
  const dated = dependencies.flatMap(d => d.predecessor?.scheduled_date
    ? [{ predecessor: d.predecessor, limit: addDays(d.predecessor.scheduled_date, d.lag_days) }] : []);
  const conflicts = dated.filter(d => date !== null && date < d.limit);
  const latest = dated.reduce<string | null>((max, d) => !max || d.limit > max ? d.limit : max, null);
  return {
    conflicts,
    pending: dependencies.flatMap(d => d.predecessor && !d.predecessor.completed ? [d.predecessor.title] : []),
    suggestedDate: latest ? (latest < todayISO() ? todayISO() : latest) : null,
  };
}
export const dependencyDateLabel = (date: string) => date.split('-').reverse().join('/');
