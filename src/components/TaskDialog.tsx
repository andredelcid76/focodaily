import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Task, TaskCategory, TaskRecurrence } from "@/hooks/useTasks";
import type { Role } from "@/hooks/useRoles";
import type { Project } from "@/hooks/useProjects";
import { toast } from "sonner";
import { formatMinutes } from "@/lib/date";
import { Link } from "@tanstack/react-router";
import { CategoryIcon } from "@/components/CategoryBadge";
import { DatePickerField } from "@/components/DatePickerField";
import { FolderKanban, Lock } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: string;
  task?: Task | null;
  roles: Role[];
  projects?: Project[];
  defaultProjectId?: string | null;
  lockedProjectId?: string | null;
  onSave: (
    data: {
      title: string;
      description: string | null;
      category: TaskCategory;
      duration_minutes: number;
      scheduled_date: string;
      recurrence: TaskRecurrence;
      role_id: string | null;
      project_id: string | null;
      non_negotiable: boolean;
      recurrence_interval: number | null;
      recurrence_weekdays: number[] | null;
      recurrence_week_interval: number | null;
      recurrence_monthly_pattern: { week: number; weekday: number } | null;
    },
    scope?: RecurrenceScope
  ) => Promise<void>;
  onDelete?: (scope?: RecurrenceScope) => Promise<void>;
};

export type RecurrenceScope = "this" | "future" | "all";

const PRESET_DURATIONS = [5, 15, 30, 45, 60, 90, 120];
const WEEKDAYS = [
  { v: 1, l: "S" },
  { v: 2, l: "T" },
  { v: 3, l: "Q" },
  { v: 4, l: "Q" },
  { v: 5, l: "S" },
  { v: 6, l: "S" },
  { v: 0, l: "D" },
];

export function TaskDialog({ open, onOpenChange, defaultDate, task, roles, projects = [], defaultProjectId, lockedProjectId, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("important");
  const [duration, setDuration] = useState(30);
  const [date, setDate] = useState(defaultDate);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("none");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [nonNegotiable, setNonNegotiable] = useState(false);
  const [interval, setIntervalDays] = useState(2);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weekInterval, setWeekInterval] = useState(1);
  const [monthlyMode, setMonthlyMode] = useState(false);
  const [monthlyWeek, setMonthlyWeek] = useState<number>(1); // 1..5 or -1
  const [monthlyWeekday, setMonthlyWeekday] = useState<number>(1); // 0..6
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      setCategory(task?.category ?? "important");
      setDuration(task?.duration_minutes ?? 30);
      setDate(task?.scheduled_date ?? defaultDate);
      setRecurrence(task?.recurrence ?? "none");
      setRoleId(task?.role_id ?? null);
      setProjectId(((task as any)?.project_id ?? defaultProjectId ?? null) as string | null);
      setNonNegotiable(!!(task as any)?.non_negotiable);
      setIntervalDays(task?.recurrence_interval ?? 2);
      setWeekdays(task?.recurrence_weekdays ?? []);
      const t: any = task;
      setWeekInterval(t?.recurrence_week_interval ?? 1);
      const mp = t?.recurrence_monthly_pattern as { week: number; weekday: number } | null | undefined;
      if (mp && typeof mp.week === "number") {
        setMonthlyMode(true);
        setMonthlyWeek(mp.week);
        setMonthlyWeekday(mp.weekday);
      } else {
        setMonthlyMode(false);
        setMonthlyWeek(1);
        setMonthlyWeekday(1);
      }
    }
  }, [open, task, defaultDate]);

  const toggleWeekday = (v: number) => {
    setWeekdays((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort()));
  };

  const isRecurringInstance = !!(task && (task.recurrence_parent_id || task.recurrence !== "none"));
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(null);

  const doSave = async (scope?: RecurrenceScope) => {
    setSaving(true);
    try {
      await onSave(
        {
          title: title.trim(),
          description: description.trim() || null,
          category,
          duration_minutes: Math.max(5, Math.min(600, duration)),
          scheduled_date: date,
          recurrence,
          role_id: roleId,
          project_id: lockedProjectId !== undefined ? lockedProjectId : projectId,
          non_negotiable: nonNegotiable,
          recurrence_interval:
            recurrence === "custom" && !monthlyMode && weekdays.length === 0 ? interval : null,
          recurrence_weekdays:
            recurrence === "custom" && !monthlyMode && weekdays.length > 0 ? weekdays : null,
          recurrence_week_interval:
            recurrence === "custom" && !monthlyMode && weekdays.length > 0 ? weekInterval : null,
          recurrence_monthly_pattern:
            recurrence === "custom" && monthlyMode ? { week: monthlyWeek, weekday: monthlyWeekday } : null,
        },
        scope
      );
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (scope?: RecurrenceScope) => {
    if (!onDelete) return;
    try {
      await onDelete(scope);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao excluir");
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Dê um título à tarefa");
      return;
    }
    if (recurrence === "custom" && weekdays.length === 0 && (!interval || interval < 1)) {
      toast.error("Defina o intervalo ou os dias da semana");
      return;
    }
    if (isRecurringInstance) {
      setPendingAction("save");
      setScopeOpen(true);
      return;
    }
    await doSave();
  };

  const handleDeleteClick = () => {
    if (!onDelete) return;
    if (isRecurringInstance) {
      setPendingAction("delete");
      setScopeOpen(true);
      return;
    }
    doDelete();
  };

  const applyScope = async (scope: RecurrenceScope) => {
    setScopeOpen(false);
    if (pendingAction === "save") await doSave(scope);
    else if (pendingAction === "delete") await doDelete(scope);
    setPendingAction(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="t-title">Título</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Revisar relatório semanal" autoFocus />
          </div>
          <div>
            <Label htmlFor="t-desc">Descrição (opcional)</Label>
            <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">
                    <span className="inline-flex items-center gap-2">
                      <CategoryIcon category="urgent" /> Urgente
                    </span>
                  </SelectItem>
                  <SelectItem value="important">
                    <span className="inline-flex items-center gap-2">
                      <CategoryIcon category="important" /> Importante
                    </span>
                  </SelectItem>
                  <SelectItem value="circumstantial">
                    <span className="inline-flex items-center gap-2">
                      <CategoryIcon category="circumstantial" /> Circunstancial
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Papel</Label>
              <Select
                value={roleId ?? "__none"}
                onValueChange={(v) => setRoleId(v === "__none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Sem papel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem papel</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roles.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  <Link to="/papeis" className="underline hover:text-foreground" onClick={() => onOpenChange(false)}>
                    Criar papéis →
                  </Link>
                </p>
              )}
            </div>
          </div>

          {lockedProjectId === undefined && projects.length > 0 && (
            <div>
              <Label>Projeto</Label>
              <Select
                value={projectId ?? "__none"}
                onValueChange={(v) => setProjectId(v === "__none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem projeto</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="inline-flex items-center gap-2">
                        <FolderKanban className="h-3 w-3" style={{ color: p.color }} />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {lockedProjectId && projects.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <FolderKanban className="h-3.5 w-3.5" />
              Vinculada ao projeto{" "}
              <span className="font-medium text-foreground">
                {projects.find((p) => p.id === lockedProjectId)?.name ?? "(projeto)"}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setNonNegotiable((v) => !v)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              nonNegotiable
                ? "border-overdue/60 bg-overdue/10"
                : "border-border/60 bg-card/40 hover:border-overdue/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <Lock className={`h-4 w-4 ${nonNegotiable ? "text-overdue" : "text-muted-foreground"}`} />
              <div>
                <div className={`text-sm font-medium ${nonNegotiable ? "text-overdue" : ""}`}>
                  Inegociável neste dia
                </div>
                <div className="text-xs text-muted-foreground">
                  Não pode ser adiada sem confirmação. Ideal para prazos e contas.
                </div>
              </div>
            </div>
            <span
              className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                nonNegotiable ? "border-overdue bg-overdue" : "border-border bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  nonNegotiable ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <div>
            <Label>Duração</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PRESET_DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    duration === m
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  {formatMinutes(m)}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={5}
                  step={15}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-7 w-20 text-xs"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <DatePickerField value={date} onChange={setDate} />
            </div>
            <div>
              <Label>Recorrência</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as TaskRecurrence)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não repete</SelectItem>
                  <SelectItem value="daily">Diariamente</SelectItem>
                  <SelectItem value="weekdays">Dias úteis (seg–sex)</SelectItem>
                  <SelectItem value="weekly">Semanalmente</SelectItem>
                  <SelectItem value="monthly">Mensalmente</SelectItem>
                  <SelectItem value="yearly">Anualmente</SelectItem>
                  <SelectItem value="custom">Personalizada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {recurrence === "custom" && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
              {/* Mode toggle */}
              <div className="flex gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMonthlyMode(false)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 font-medium transition-colors ${
                    !monthlyMode ? "border-primary bg-primary/15 text-primary" : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  Por semana
                </button>
                <button
                  type="button"
                  onClick={() => setMonthlyMode(true)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 font-medium transition-colors ${
                    monthlyMode ? "border-primary bg-primary/15 text-primary" : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  Padrão mensal
                </button>
              </div>

              {!monthlyMode && (
                <>
                  <div>
                    <Label className="text-xs">Dias da semana (opcional)</Label>
                    <div className="mt-1.5 flex gap-1">
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d.v}
                          type="button"
                          onClick={() => toggleWeekday(d.v)}
                          className={`h-8 w-8 rounded-lg border text-xs font-semibold transition-colors ${
                            weekdays.includes(d.v)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card hover:border-primary/40"
                          }`}
                        >
                          {d.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {weekdays.length > 0 ? (
                    <div>
                      <Label className="text-xs">A cada</Label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={12}
                          value={weekInterval}
                          onChange={(e) => setWeekInterval(Math.max(1, Number(e.target.value) || 1))}
                          className="h-8 w-20"
                        />
                        <span className="text-sm text-muted-foreground">
                          semana(s) {weekInterval > 1 ? "(ex.: semana sim, semana não)" : ""}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs">Ou repita a cada</Label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={interval}
                          onChange={(e) => setIntervalDays(Number(e.target.value))}
                          className="h-8 w-20"
                        />
                        <span className="text-sm text-muted-foreground">dia(s)</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {monthlyMode && (
                <div>
                  <Label className="text-xs">Padrão mensal</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <Select value={String(monthlyWeek)} onValueChange={(v) => setMonthlyWeek(Number(v))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Primeira</SelectItem>
                        <SelectItem value="2">Segunda</SelectItem>
                        <SelectItem value="3">Terceira</SelectItem>
                        <SelectItem value="4">Quarta</SelectItem>
                        <SelectItem value="5">Quinta</SelectItem>
                        <SelectItem value="-1">Última</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={String(monthlyWeekday)} onValueChange={(v) => setMonthlyWeekday(Number(v))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">segunda-feira</SelectItem>
                        <SelectItem value="2">terça-feira</SelectItem>
                        <SelectItem value="3">quarta-feira</SelectItem>
                        <SelectItem value="4">quinta-feira</SelectItem>
                        <SelectItem value="5">sexta-feira</SelectItem>
                        <SelectItem value="6">sábado</SelectItem>
                        <SelectItem value="0">domingo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Ex.: "primeira segunda de cada mês" ou "última sexta do mês".
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {task && onDelete && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDeleteClick}>
                Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Recurrence scope sub-dialog */}
      <Dialog open={scopeOpen} onOpenChange={(v) => { if (!v) { setScopeOpen(false); setPendingAction(null); } }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {pendingAction === "delete" ? "Excluir tarefa recorrente" : "Alterar tarefa recorrente"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta tarefa se repete. O que você quer {pendingAction === "delete" ? "excluir" : "alterar"}?
          </p>
          <div className="mt-2 space-y-2">
            <button
              onClick={() => applyScope("this")}
              className="w-full rounded-xl border border-border/60 bg-card/60 p-3 text-left hover:border-primary/50 transition-colors"
            >
              <div className="text-sm font-semibold">Apenas esta instância</div>
              <div className="text-xs text-muted-foreground">As outras ocorrências continuam como estão.</div>
            </button>
            <button
              onClick={() => applyScope("future")}
              className="w-full rounded-xl border border-border/60 bg-card/60 p-3 text-left hover:border-primary/50 transition-colors"
            >
              <div className="text-sm font-semibold">Esta e todas as futuras em aberto</div>
              <div className="text-xs text-muted-foreground">Ocorrências passadas e concluídas não mudam.</div>
            </button>
            <button
              onClick={() => applyScope("all")}
              className="w-full rounded-xl border border-border/60 bg-card/60 p-3 text-left hover:border-primary/50 transition-colors"
            >
              <div className="text-sm font-semibold">Todas as instâncias (sempre)</div>
              <div className="text-xs text-muted-foreground">Aplica a toda a série, inclusive as anteriores em aberto.</div>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setScopeOpen(false); setPendingAction(null); }}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
