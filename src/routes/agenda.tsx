import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useMeetings, meetingDurationMinutes, type Meeting } from "@/hooks/useMeetings";
import { Link2, Link2Off, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePickerField } from "@/components/DatePickerField";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { addDays, formatHuman, formatMinutes, todayISO, toISODate } from "@/lib/date";
import { toast } from "sonner";

export const Route = createFileRoute("/agenda")({
  component: () => (
    <AppShell>
      <AgendaPage />
    </AppShell>
  ),
});

function AgendaPage() {
  const { user, session } = useAuth();
  if (!user || !session) return null;
  return <AgendaInner userId={user.id} accessToken={session.access_token} />;
}

function AgendaInner({ userId, accessToken }: { userId: string; accessToken: string }) {
  const today = todayISO();
  const [viewDate, setViewDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [outlook, setOutlook] = useState<{
    connected: boolean;
    email?: string | null;
    last_sync_at?: string | null;
  }>({ connected: false });
  const meetingsApi = useMeetings(userId);

  const outlookRequest = async <T,>(method: "GET" | "POST", body?: Record<string, unknown>) => {
    const response = await fetch("/api/public/outlook", {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? "Erro ao comunicar com Outlook");
    }

    return payload as T;
  };

  // Read callback message from URL (?outlook=success|error&msg=...)
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("outlook");
    const msg = url.searchParams.get("msg");
    if (status && msg) {
      if (status === "success") toast.success(msg);
      else toast.error(msg);
      url.searchParams.delete("outlook");
      url.searchParams.delete("msg");
      window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams}` : ""));
    }
  }, []);

  const refreshOutlookStatus = async () => {
    try {
      const res = await outlookRequest<{
        connected: boolean;
        connection: { email?: string | null; last_sync_at?: string | null } | null;
      }>("GET");
      setOutlook({
        connected: res.connected,
        email: res.connection?.email,
        last_sync_at: res.connection?.last_sync_at,
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshOutlookStatus();
  }, []);

  const dayMeetings = useMemo(
    () =>
      meetingsApi
        .meetingsByDay(viewDate)
        .slice()
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [meetingsApi, viewDate]
  );

  const totalMinutes = dayMeetings.reduce((s, m) => s + meetingDurationMinutes(m), 0);
  const isViewingToday = viewDate === today;

  const dayLabel = isViewingToday
    ? `Hoje · ${formatHuman(viewDate)}`
    : viewDate === addDays(today, 1)
    ? `Amanhã · ${formatHuman(viewDate)}`
    : formatHuman(viewDate);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (m: Meeting) => {
    setEditing(m);
    setDialogOpen(true);
  };

  const onConnect = async () => {
    setConnecting(true);
    try {
      const res = await outlookRequest<{ url: string }>("POST", {
        action: "connect",
        origin: window.location.origin,
      });
      window.location.href = res.url;
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao iniciar conexão");
      setConnecting(false);
    }
  };

  const onDisconnect = async () => {
    try {
      await outlookRequest("POST", { action: "disconnect" });
      toast.success("Outlook desconectado");
      setOutlook({ connected: false });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao desconectar");
    }
  };

  const onSync = async () => {
    if (!outlook.connected) {
      toast.error("Conecte o Outlook primeiro");
      return;
    }
    setSyncing(true);
    try {
      const res = await outlookRequest<{ imported: number; total: number; errors?: string[] }>("POST", { action: "sync" });
      if (res.total === 0) {
        toast.info("Nenhum compromisso encontrado no Outlook (janela: -7d a +60d)");
      } else if (res.imported === 0) {
        toast.error(`Outlook retornou ${res.total} eventos, mas nenhum foi salvo. ${res.errors?.[0] ?? ""}`);
      } else {
        toast.success(`${res.imported}/${res.total} reuniões sincronizadas`);
      }
      await meetingsApi.refresh();
      await refreshOutlookStatus();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Agenda</p>
          <h1 className="font-display text-3xl font-bold capitalize">{dayLabel}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 p-1 backdrop-blur-sm">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDate(addDays(viewDate, -1))} aria-label="Dia anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Escolher dia</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={(() => { const [y,m,d]=viewDate.split("-").map(Number); return new Date(y,m-1,d); })()}
                  onSelect={(date) => { if (date) setViewDate(toISODate(date)); }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {!isViewingToday && (
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setViewDate(today)}>Hoje</Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDate(addDays(viewDate, 1))} aria-label="Próximo dia">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {outlook.connected ? (
            <>
              <Button variant="outline" onClick={onSync} disabled={syncing}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                Sincronizar Outlook
              </Button>
              <Button variant="ghost" size="sm" onClick={onDisconnect} title={outlook.email ?? "Outlook conectado"}>
                <Link2Off className="mr-1.5 h-4 w-4" /> Desconectar
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onConnect} disabled={connecting}>
              <Link2 className="mr-1.5 h-4 w-4" /> {connecting ? "Abrindo…" : "Conectar Outlook"}
            </Button>
          )}
          <Button onClick={openNew} className="bg-gradient-prestige text-primary-foreground hover:opacity-90">
            <Plus className="mr-1 h-4 w-4" /> Nova reunião
          </Button>
        </div>
      </div>

      {outlook.connected && outlook.email && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Conectado como <span className="font-medium">{outlook.email}</span>
          {outlook.last_sync_at && (
            <span className="text-muted-foreground">· última sincronização {new Date(outlook.last_sync_at).toLocaleString("pt-BR")}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Reuniões no dia" value={String(dayMeetings.length)} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Tempo programado" value={formatMinutes(totalMinutes)} accent />
      </div>

      {dayMeetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
          <p className="text-muted-foreground">Sem reuniões neste dia.</p>
          <Button variant="outline" className="mt-4" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar reunião
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {dayMeetings.map((m) => (
            <MeetingRow key={m.id} meeting={m} onClick={() => openEdit(m)} />
          ))}
        </div>
      )}

      <MeetingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={viewDate}
        meeting={editing}
        onSave={async (payload) => {
          if (editing) {
            await meetingsApi.updateMeeting(editing.id, payload);
            toast.success("Reunião atualizada");
          } else {
            await meetingsApi.createMeeting(payload);
            toast.success("Reunião criada");
          }
        }}
        onDelete={
          editing
            ? async () => {
                await meetingsApi.deleteMeeting(editing.id);
                toast.success("Reunião excluída");
              }
            : undefined
        }
      />
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 backdrop-blur-sm ${accent ? "border-primary/40 bg-primary/10" : "border-border/60 bg-card/60"}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-1 font-display text-2xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function MeetingRow({ meeting, onClick }: { meeting: Meeting; onClick: () => void }) {
  const start = new Date(meeting.starts_at);
  const end = new Date(meeting.ends_at);
  const fmt = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const duration = meetingDurationMinutes(meeting);

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-stretch gap-3 rounded-xl border border-border/60 bg-card/60 p-3 text-left transition-colors hover:border-primary/40"
    >
      <div className="w-1 rounded-full" style={{ backgroundColor: meeting.color }} />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{meeting.title}</span>
          {meeting.source === "outlook" && (
            <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-500">Outlook</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {meeting.is_all_day ? "Dia inteiro" : `${fmt(start)} – ${fmt(end)} · ${formatMinutes(duration)}`}
          </span>
          {meeting.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {meeting.location}
            </span>
          )}
          {meeting.web_link && (
            <a
              href={meeting.web_link}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Abrir
            </a>
          )}
        </div>
      </div>
    </button>
  );
}

function MeetingDialog({
  open,
  onOpenChange,
  defaultDate,
  meeting,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: string;
  meeting: Meeting | null;
  onSave: (payload: {
    title: string;
    description: string | null;
    location: string | null;
    starts_at: string;
    ends_at: string;
    is_all_day: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const initialStart = meeting ? new Date(meeting.starts_at) : new Date(`${defaultDate}T09:00:00`);
  const initialEnd = meeting ? new Date(meeting.ends_at) : new Date(`${defaultDate}T10:00:00`);

  const [title, setTitle] = useState(meeting?.title ?? "");
  const [description, setDescription] = useState(meeting?.description ?? "");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [date, setDate] = useState(toISODate(initialStart));
  const [startTime, setStartTime] = useState(initialStart.toTimeString().slice(0, 5));
  const [endTime, setEndTime] = useState(initialEnd.toTimeString().slice(0, 5));
  const [allDay, setAllDay] = useState(meeting?.is_all_day ?? false);
  const [saving, setSaving] = useState(false);

  // Reset on open
  useMemo(() => {
    if (open) {
      const s = meeting ? new Date(meeting.starts_at) : new Date(`${defaultDate}T09:00:00`);
      const e = meeting ? new Date(meeting.ends_at) : new Date(`${defaultDate}T10:00:00`);
      setTitle(meeting?.title ?? "");
      setDescription(meeting?.description ?? "");
      setLocation(meeting?.location ?? "");
      setDate(toISODate(s));
      setStartTime(s.toTimeString().slice(0, 5));
      setEndTime(e.toTimeString().slice(0, 5));
      setAllDay(meeting?.is_all_day ?? false);
    }
  }, [open, meeting, defaultDate]);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Dê um título à reunião");
      return;
    }
    const startISO = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`;
    const endISO = allDay ? `${date}T23:59:59` : `${date}T${endTime}:00`;
    if (!allDay && new Date(endISO) <= new Date(startISO)) {
      toast.error("O horário final deve ser depois do início");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        starts_at: new Date(startISO).toISOString(),
        ends_at: new Date(endISO).toISOString(),
        is_all_day: allDay,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{meeting ? "Editar reunião" : "Nova reunião"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Reunião com cliente" autoFocus />
          </div>
          <div>
            <Label>Local (opcional)</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sala, link Teams, etc." />
          </div>
          <div>
            <Label>Data</Label>
            <DatePickerField value={date} onChange={setDate} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Dia inteiro
          </label>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {meeting?.source === "outlook" && (
            <p className="text-xs text-muted-foreground">
              Esta reunião veio do Outlook. Edições locais não voltam para o servidor enquanto a integração de escrita não é finalizada.
            </p>
          )}
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {meeting && onDelete && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete().then(() => onOpenChange(false))}>
                <Trash2 className="mr-1 h-4 w-4" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
