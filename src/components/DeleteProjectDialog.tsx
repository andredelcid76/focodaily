import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Unlink, FolderInput, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/hooks/useProjects";

export type DeleteProjectOptions = {
  taskMode: "unlink" | "move" | "delete";
  targetProjectId?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  otherProjects: Project[];
  onConfirm: (options: DeleteProjectOptions) => Promise<void>;
};

export function DeleteProjectDialog({ open, onOpenChange, project, otherProjects, onConfirm }: Props) {
  const [mode, setMode] = useState<DeleteProjectOptions["taskMode"]>("unlink");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<{ total: number; open: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("unlink");
    setTargetId(null);
    setCounts(null);
    (async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id,completed")
        .eq("project_id", project.id);
      if (data) {
        setCounts({ total: data.length, open: data.filter((t) => !t.completed).length });
      }
    })();
  }, [open, project.id]);

  const confirm = async () => {
    if (mode === "move" && !targetId) {
      toast.error("Escolha o projeto de destino");
      return;
    }
    setBusy(true);
    try {
      await onConfirm({ taskMode: mode, targetProjectId: mode === "move" ? targetId : null });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir projeto");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Excluir “{project.name}”
          </DialogTitle>
          <DialogDescription>
            {counts
              ? `${counts.total} tarefa(s) vinculada(s) · ${counts.open} em aberto. Escolha o que fazer com elas.`
              : "Verificando tarefas vinculadas…"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <OptionRow
            active={mode === "unlink"}
            onClick={() => setMode("unlink")}
            icon={<Unlink className="h-4 w-4" />}
            title="Manter as tarefas sem projeto"
            desc="As tarefas continuam existindo e ficam sem vínculo (recomendado)."
          />
          <OptionRow
            active={mode === "move"}
            onClick={() => setMode("move")}
            icon={<FolderInput className="h-4 w-4" />}
            title="Mover as tarefas para outro projeto"
            desc="Todas as tarefas e reuniões passam para o projeto escolhido."
            disabled={otherProjects.length === 0}
          />
          {mode === "move" && (
            <div className="pl-8">
              <Label className="text-xs text-muted-foreground">Projeto de destino</Label>
              <Select value={targetId ?? undefined} onValueChange={setTargetId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione um projeto" />
                </SelectTrigger>
                <SelectContent>
                  {otherProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <OptionRow
            active={mode === "delete"}
            onClick={() => setMode("delete")}
            icon={<Trash2 className="h-4 w-4" />}
            title="Excluir as tarefas junto"
            desc="Ação irreversível: todas as tarefas do projeto serão apagadas."
            danger
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "Excluindo…" : "Excluir projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionRow({
  active, onClick, icon, title, desc, danger, disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
        active
          ? danger
            ? "border-destructive/60 bg-destructive/10"
            : "border-primary/60 bg-primary/10"
          : "border-border/60 hover:bg-muted/50"
      }`}
    >
      <span className={`mt-0.5 ${danger ? "text-destructive" : active ? "text-primary" : "text-muted-foreground"}`}>
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}
