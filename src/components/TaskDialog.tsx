import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Task, TaskCategory, TaskRecurrence } from "@/hooks/useTasks";
import type { Role } from "@/hooks/useRoles";
import { toast } from "sonner";
import { formatMinutes } from "@/lib/date";
import { Link } from "@tanstack/react-router";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: string;
  task?: Task | null;
  roles: Role[];
  onSave: (data: {
    title: string;
    description: string | null;
    category: TaskCategory;
    duration_minutes: number;
    scheduled_date: string;
    recurrence: TaskRecurrence;
    role_id: string | null;
    recurrence_interval: number | null;
    recurrence_weekdays: number[] | null;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
};

const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const WEEKDAYS = [
  { v: 1, l: "S" },
  { v: 2, l: "T" },
  { v: 3, l: "Q" },
  { v: 4, l: "Q" },
  { v: 5, l: "S" },
  { v: 6, l: "S" },
  { v: 0, l: "D" },
];

export function TaskDialog({ open, onOpenChange, defaultDate, task, roles, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("important");
  const [duration, setDuration] = useState(30);
  const [date, setDate] = useState(defaultDate);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("none");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [interval, setIntervalDays] = useState(2);
  const [weekdays, setWeekdays] = useState<number[]>([]);
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
      setIntervalDays(task?.recurrence_interval ?? 2);
      setWeekdays(task?.recurrence_weekdays ?? []);
    }
  }, [open, task, defaultDate]);

  const toggleWeekday = (v: number) => {
    setWeekdays((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort()));
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
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        category,
        duration_minutes: Math.max(5, Math.min(600, duration)),
        scheduled_date: date,
        recurrence,
        role_id: roleId,
        recurrence_interval: recurrence === "custom" && weekdays.length === 0 ? interval : null,
        recurrence_weekdays: recurrence === "custom" && weekdays.length > 0 ? weekdays : null,
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
                  <SelectItem value="urgent">🔥 Urgente</SelectItem>
                  <SelectItem value="important">⭐ Importante</SelectItem>
                  <SelectItem value="circumstantial">💧 Circunstancial</SelectItem>
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
              <Label htmlFor="t-date">Data</Label>
              <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Recorrência</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as TaskRecurrence)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não repete</SelectItem>
                  <SelectItem value="daily">Diariamente</SelectItem>
                  <SelectItem value="weekly">Semanalmente</SelectItem>
                  <SelectItem value="monthly">Mensalmente</SelectItem>
                  <SelectItem value="custom">Personalizada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {recurrence === "custom" && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
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
              {weekdays.length === 0 && (
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
            </div>
          )}
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {task && onDelete && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => { await onDelete(); onOpenChange(false); }}>
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
    </Dialog>
  );
}
