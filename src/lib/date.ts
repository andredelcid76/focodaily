export const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
let browserTimezone = DEFAULT_TIMEZONE;
export function setBrowserTimezone(timezone: string | null | undefined) {
  browserTimezone = validTimezone(timezone);
}
export function validTimezone(timezone: string | null | undefined): string {
  try { new Intl.DateTimeFormat("en", { timeZone: timezone || DEFAULT_TIMEZONE }); return timezone || DEFAULT_TIMEZONE; }
  catch { return DEFAULT_TIMEZONE; }
}
export function dateInTimezone(date: Date, timezone: string | null = browserTimezone): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: validTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export const todayISO = (timezone = browserTimezone, now = new Date()) => dateInTimezone(now, timezone);

export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};

export const startOfWeek = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  dt.setDate(dt.getDate() + diff);
  return toISODate(dt);
};

export const weekDays = (startISO: string) =>
  Array.from({ length: 7 }, (_, i) => addDays(startISO, i));

export const formatHuman = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
};

export const formatShort = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

export const formatMinutes = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m}min`;
};

function wallClockAsUTC(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimezone(timezone), hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second"));
}

/** "HH:MM" of an instant on the user's clock (profile timezone). */
export function timeInTimezone(date: Date, timezone: string | null = browserTimezone): string {
  const wall = new Date(wallClockAsUTC(date, timezone ?? DEFAULT_TIMEZONE));
  return `${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`;
}

/** Instant for a calendar date + clock time in the user's timezone (not the device's). */
export function zonedDateTime(iso: string, time: string, timezone: string | null = browserTimezone): Date {
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const [y, m, d] = iso.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const first = guess - (wallClockAsUTC(new Date(guess), tz) - guess);
  return new Date(guess - (wallClockAsUTC(new Date(first), tz) - first));
}
