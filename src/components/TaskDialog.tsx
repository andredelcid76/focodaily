import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Task, TaskCategory, TaskRecurrence } from "@/hooks/useTasks";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: string;
  task?: Task | null;
  onSave: (data: {
    title: string;
    description: string | null;
    category: TaskCategory;
    duration_minutes: number;
    scheduled_date: string;
    recurrence: TaskRecurrence;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function TaskDialog({ open, onOpenChange, defaultDate, task, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("important");
  const [duration, setDuration] = useState(30);
  const [date, setDate] = useState(defaultDate);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      setCategory(task?.category ?? "important");
      setDuration(task?.duration_minutes ?? 30);
      setDate(task?.scheduled_date ?? defaultDate);
      setRecurrence(task?.recurrence ?? "none");
    }
  }, [open, task, defaultDate]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Dê um título à tarefa");
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
              <Label htmlFor="t-dur">Duração (min)</Label>
              <Input id="t-dur" type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
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
                </SelectContent>
              </Select>
            </div>
          </div>
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
