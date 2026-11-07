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
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toISODate(dt);
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
