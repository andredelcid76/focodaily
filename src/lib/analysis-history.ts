import { addDays } from "./date";
/** All history includes future events too, rather than truncating either end. */
export function historyDays(today: string, dates: string[]): string[] {
  const valid = dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  const start = valid[0] && valid[0] < today ? valid[0] : today;
  const last = valid.at(-1);
  const end = last && last > today ? last : today;
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
  return days;
}