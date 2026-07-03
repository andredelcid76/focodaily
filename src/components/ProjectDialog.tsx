import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { ProjectMembersSection } from "@/components/ProjectMembersSection";
import { PROJECT_COLORS, PROJECT_STATUS_LABEL, type Project, type ProjectStatus } from "@/hooks/useProjects";
import type { Role } from "@/hooks/useRoles";
import { listTeams } from "@/lib/teams.functions";
import { Users, User as UserIcon, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: Project | null;
  roles: Role[];
  onSave: (data: {
    name: string;
    description: string | null;
    color: string;
    role_id: string | null;
    status: ProjectStatus;
    starts_on: string | null;
    deadline: string | null;
    team_id: string | null;
    members_can_reassign: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function ProjectDialog({ open, onOpenChange, project, roles, onSave, onDelete }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [startsOn, setStartsOn] = useState<string>("");
  const [deadline, setDeadline] = useState<string>("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [membersCanReassign, setMembersCanReassign] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const isOwner = !project || project.user_id === user?.id;

  const fetchTeams = useServerFn(listTeams);
  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: () => fetchTeams(),
    enabled: open,
    staleTime: 30_000,
  });
  const teams = teamsData?.teams ?? [];

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setDescription(project?.description ?? "");
      setColor(project?.color ?? PROJECT_COLORS[0]);
      setRoleId(project?.role_id ?? null);
      setStatus(project?.status ?? "active");
      setStartsOn(project?.starts_on ?? "");
      setDeadline(project?.deadline ?? "");
      setTeamId(((project as any)?.team_id ?? null) as string | null);
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Dê um nome ao projeto");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        color,
        role_id: roleId,
        status,
        starts_on: startsOn || null,
        deadline: deadline || null,
        team_id: teamId,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar projeto");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm("Excluir este projeto? As tarefas e reuniões vinculadas ficarão sem projeto.")) return;
    try {
      await onDelete();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao excluir");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Editar projeto" : "Novo projeto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="p-name">Nome</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Lançamento do produto"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="p-desc">Contexto / briefing</Label>
            <Textarea
              id="p-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Objetivos, escopo, decisões importantes, links de referência…"
            />
          </div>

          <div>
            <Label>Visibilidade</Label>
            <Select
              value={teamId ?? "__personal"}
              onValueChange={(v) => setTeamId(v === "__personal" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__personal">
                  <span className="inline-flex items-center gap-2">
                    <UserIcon className="h-3 w-3" /> Pessoal
                  </span>
                </SelectItem>
                {teams.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-flex items-center gap-2">
                      <Users className="h-3 w-3" style={{ color: t.color }} />
                      Equipe: {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {teamId
                ? "Todos os membros da equipe verão e poderão colaborar neste projeto."
                : teams.length === 0
                ? (
                  <>
                    Apenas você tem acesso.{" "}
                    <Link to="/equipes" className="underline hover:text-foreground" onClick={() => onOpenChange(false)}>
                      Criar equipe
                    </Link>
                    {" "}para compartilhar com várias pessoas.
                  </>
                )
                : "Apenas você tem acesso (pode convidar pessoas individualmente abaixo)."}
            </p>
          </div>

          <div>
            <Label>Cor</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <DatePickerField value={startsOn} onChange={setStartsOn} />
            </div>
            <div>
              <Label>Prazo final</Label>
              <DatePickerField value={deadline} onChange={setDeadline} />
            </div>
          </div>

          {project?.id && <ProjectMembersSection projectId={project.id} />}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {project && onDelete && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete}>
                Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
