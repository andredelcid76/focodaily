import { useEffect, useState } from "react";
import { CalendarClock, ChevronRight, ChevronLeft, ExternalLink, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { formatMinutes } from "@/lib/date";
import type { Meeting } from "@/hooks/useMeetings";

const STORAGE_KEY = "focodaily.meetingsRailOpen";

export function MeetingsRail({
  meetings,
  totalMinutes,
  includeMeetings,
  onToggleInclude,
}: {
  meetings: Meeting[];
  totalMinutes: number;
  includeMeetings: boolean;
  onToggleInclude: (v: boolean) => void;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  const nowMs = Date.now();
  const sorted = [...meetings].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  );
  const upcoming = sorted.filter((m) => new Date(m.ends_at).getTime() > nowMs);
  const upcomingCount = upcoming.length;
  const nextMeeting = upcoming[0];

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (meetings.length === 0) return null;

  return (
    <>
      {/* Mini rail (collapsed) — vertical tab fixed to the right edge */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-0 top-1/2 z-40 -translate-y-1/2 group flex flex-col items-center gap-2 rounded-l-xl border border-r-0 border-border/60 bg-card/80 px-2 py-3 shadow-[var(--shadow-card)] backdrop-blur-xl hover:border-primary/50 hover:bg-card transition-all"
          aria-label="Abrir compromissos do dia"
          title={`${meetings.length} reuni${meetings.length === 1 ? "ão" : "ões"} hoje`}
        >
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          <CalendarClock className="h-4 w-4 text-primary" />
          <span className="rotate-180 [writing-mode:vertical-rl] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {upcomingCount > 0
              ? `${upcomingCount} próx · ${formatMinutes(totalMinutes)}`
              : `${meetings.length} no dia`}
          </span>
          {nextMeeting && (
            <span className="mt-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
              {fmtTime(nextMeeting.starts_at)}
            </span>
          )}
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <>
          {/* Backdrop on mobile */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            className="fixed inset-0 z-30 bg-background/40 backdrop-blur-sm md:hidden"
          />
          <aside
            className="fixed right-0 top-0 bottom-0 z-40 flex w-[min(22rem,90vw)] flex-col border-l border-border/60 bg-card/95 shadow-[var(--shadow-glow)] backdrop-blur-xl"
            aria-label="Compromissos do dia"
          >
            <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-semibold">Compromissos</h3>
                <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {meetings.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                aria-label="Recolher"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </header>

            <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium">{formatMinutes(totalMinutes)}</span>
                {upcomingCount < meetings.length && (
                  <span className="ml-1">({upcomingCount} restante{upcomingCount === 1 ? "" : "s"})</span>
                )}
              </div>
              <label className="flex items-center gap-2">
                Incluir nas somas
                <Switch checked={includeMeetings} onCheckedChange={onToggleInclude} />
              </label>
            </div>

            <ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
              {sorted.map((m) => {
                const isPast = new Date(m.ends_at).getTime() <= nowMs;
                const isOngoing = !isPast && new Date(m.starts_at).getTime() <= nowMs;
                return (
                  <li
                    key={m.id}
                    className={`flex items-start gap-3 px-4 py-3 text-sm transition-colors ${
                      isPast ? "opacity-50" : "hover:bg-card/60"
                    }`}
                  >
                    <div
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: m.color || "#0ea5e9" }}
                      aria-hidden
                    />
                    <div className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {m.is_all_day ? (
                        <span>dia todo</span>
                      ) : (
                        <>
                          <div className={isPast ? "line-through" : ""}>{fmtTime(m.starts_at)}</div>
                          <div className="text-muted-foreground/70">{fmtTime(m.ends_at)}</div>
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-medium leading-tight ${
                            isPast ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {m.title}
                        </span>
                        {isOngoing && (
                          <span className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            agora
                          </span>
                        )}
                      </div>
                      {m.location && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{m.location}</span>
                        </div>
                      )}
                    </div>
                    {m.web_link && (
                      <a
                        href={m.web_link}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                        aria-label="Abrir reunião"
                        title="Abrir no Outlook"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        </>
      )}
    </>
  );
}
