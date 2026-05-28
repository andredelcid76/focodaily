import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Role } from "@/hooks/useRoles";
import type { Project } from "@/hooks/useProjects";
import type { TaskCategory } from "@/hooks/useTasks";
import { toast } from "sonner";
import { ListPlus } from "lucide-react";

type LineParse = {
  title: string;
  duration: number;
  category: TaskCategory;
  date: string;
  projectId: string | null;
  projectMatchFailed?: string;
};

// Parse #date in formats: #YYYY-MM-DD, #DD/MM, #DD/MM/YYYY, #DD-MM, #hoje, #amanha
function parseDateTag(raw: string, fallbackDate: string): string | null {
  const s = raw.toLowerCase().trim();
  if (s === "hoje") return fallbackDate;
  if (s === "amanha" || s === "amanhã") {
    const [y, m, d] = fallbackDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const year = fallbackDate.slice(0, 4);
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// Parse a line. Supports inline tags:
//   "Revisar contrato @45 !urgente #25/12"
//   "@30" → duração, "!urg|!imp|!circ" → categoria, "#data" → data
function parseLine(
  raw: string,
  defaults: { duration: number; category: TaskCategory; date: string; projectId: string | null },
  projects: Project[],
): LineParse | null {
  const line = raw.trim();
  if (!line) return null;
  let title = line;
  let duration = defaults.duration;
  let category = defaults.category;
  let date = defaults.date;
  let projectId = defaults.projectId;
  let projectMatchFailed: string | undefined;

  const durMatch = title.match(/(?:^|\s)@(\d{1,4})\b/);
  if (durMatch) {
    duration = Math.max(5, parseInt(durMatch[1], 10));
    title = title.replace(durMatch[0], " ").trim();
  }
  const dateMatch = title.match(/(?:^|\s)#(\S+)/);
  if (dateMatch) {
    const parsed = parseDateTag(dateMatch[1], defaults.date);
    if (parsed) {
      date = parsed;
      title = title.replace(dateMatch[0], " ").trim();
    }
  }
  const catMatch = title.match(/(?:^|\s)!(urg|urgente|imp|importante|circ|circunstancial)\b/i);
  if (catMatch) {
    const tag = catMatch[1].toLowerCase();
    if (tag.startsWith("urg")) category = "urgent";
    else if (tag.startsWith("imp")) category = "important";
    else if (tag.startsWith("circ")) category = "circumstantial";
    title = title.replace(catMatch[0], " ").trim();
  }
  // +projeto (suporta aspas para nomes com espaço: +"Projeto X")
  const projMatch = title.match(/(?:^|\s)\+(?:"([^"]+)"|(\S+))/);
  if (projMatch) {
    const raw = (projMatch[1] ?? projMatch[2] ?? "").replace(/_/g, " ").trim().toLowerCase();
    const active = projects.filter((p) => p.status !== "archived");
    const found =
      active.find((p) => p.name.toLowerCase() === raw) ||
      active.find((p) => p.name.toLowerCase().startsWith(raw)) ||
      active.find((p) => p.name.toLowerCase().includes(raw));
    if (found) projectId = found.id;
    else projectMatchFailed = projMatch[1] ?? projMatch[2];
    title = title.replace(projMatch[0], " ").trim();
  }
  // Strip leading bullets
  title = title.replace(/^[-*•]\s*/, "").trim();
  if (!title) return null;
  return { title, duration, category, date, projectId, projectMatchFailed };
}

export function BulkTaskDialog({
  open,
  onOpenChange,
  defaultDate,
  roles,
  projects,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate: string;
  roles: Role[];
  projects: Project[];
  onCreate: (rows: Array<{
    title: string;
    duration_minutes: number;
    category: TaskCategory;
    scheduled_date: string;
    role_id: string | null;
    project_id: string | null;
  }>) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [duration, setDuration] = useState(30);
  const [category, setCategory] = useState<TaskCategory>("important");
  const [roleId, setRoleId] = useState<string>("none");
  const [projectId, setProjectId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  const defaultProjectId = projectId === "none" ? null : projectId;
  const lines = text
    .split("\n")
    .map((l) => parseLine(l, { duration, category, date, projectId: defaultProjectId }, projects))
    .filter(Boolean) as LineParse[];
  const unmatchedProjects = Array.from(
    new Set(lines.map((l) => l.projectMatchFailed).filter(Boolean) as string[]),
  );

  const submit = async () => {
    if (lines.length === 0) {
      toast.error("Adicione ao menos uma tarefa");
      return;
    }
    setBusy(true);
    try {
      await onCreate(
        lines.map((l) => ({
          title: l.title,
          duration_minutes: l.duration,
          category: l.category,
          scheduled_date: l.date,
          role_id: roleId === "none" ? null : roleId,
          project_id: l.projectId,
        }))
      );
      toast.success(`${lines.length} tarefa${lines.length === 1 ? "" : "s"} criada${lines.length === 1 ? "" : "s"}`);
      setText("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar tarefas");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="h-5 w-5" /> Criar várias tarefas
          </DialogTitle>
          <DialogDescription>
            Uma tarefa por linha. Use <code className="text-xs bg-muted px-1 rounded">@30</code> (duração), <code className="text-xs bg-muted px-1 rounded">!urgente</code>/<code className="text-xs bg-muted px-1 rounded">!importante</code>/<code className="text-xs bg-muted px-1 rounded">!circ</code> (categoria), <code className="text-xs bg-muted px-1 rounded">#25/12</code>/<code className="text-xs bg-muted px-1 rounded">#hoje</code>/<code className="text-xs bg-muted px-1 rounded">#amanha</code> (data) e <code className="text-xs bg-muted px-1 rounded">+projeto</code> ou <code className="text-xs bg-muted px-1 rounded">+"Nome do projeto"</code> (projeto).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Ex.:\nResponder e-mails @20 #hoje\nPreparar apresentação @60 !urgente #amanha\nLigar para cliente @15 #25/12"}
            className="min-h-[200px] font-mono text-sm"
            autoFocus
          />


          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Duração padrão (min)</Label>
              <Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Math.max(5, parseInt(e.target.value || "30", 10)))} />
            </div>
            <div>
              <Label className="text-xs">Categoria padrão</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgente</SelectItem>
                  <SelectItem value="important">Importante</SelectItem>
                  <SelectItem value="circumstantial">Circunstancial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Papel</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem papel</SelectItem>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs">Projeto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {projects.filter((p) => p.status !== "archived").map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground">
              {lines.length} tarefa{lines.length === 1 ? "" : "s"} pronta{lines.length === 1 ? "" : "s"} para criar
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
              <Button onClick={submit} disabled={busy || lines.length === 0}>
                Criar {lines.length > 0 ? lines.length : ""}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
