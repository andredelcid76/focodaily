import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Users,
  Mail,
  Trash2,
  Copy,
  Check,
  UserPlus,
  Clock,
  Crown,
  ArrowLeft,
  FolderKanban,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AppShell } from "@/components/AppShell";
import {
  getTeamDetail,
  inviteToTeam,
  revokeTeamInvite,
  removeTeamMember,
  updateTeam,
  deleteTeam,
} from "@/lib/teams.functions";
import { PROJECT_COLORS } from "@/hooks/useProjects";

export const Route = createFileRoute("/equipes/$id")({
  component: () => (
    <AppShell>
      <TeamDetailPage />
    </AppShell>
  ),
});

function TeamDetailPage() {
  const { id: teamId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchDetail = useServerFn(getTeamDetail);
  const invite = useServerFn(inviteToTeam);
  const revoke = useServerFn(revokeTeamInvite);
  const remove = useServerFn(removeTeamMember);
  const update = useServerFn(updateTeam);
  const del = useServerFn(deleteTeam);

  const { data, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => fetchDetail({ data: { team_id: teamId } }),
  });

  const [email, setEmail] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(PROJECT_COLORS[0]);

  const inviteMut = useMutation({
    mutationFn: (e: string) =>
      invite({ data: { team_id: teamId, email: e, origin: window.location.origin } }),
    onSuccess: (res) => {
      setEmail("");
      setLastInviteUrl(res.invite_url);
      toast.success(`Convite criado para ${res.email}`);
      qc.invalidateQueries({ queryKey: ["team", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { invite_id: id } }),
    onSuccess: () => {
      toast.success("Convite removido");
      qc.invalidateQueries({ queryKey: ["team", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (uid: string) => remove({ data: { team_id: teamId, user_id: uid } }),
    onSuccess: () => {
      toast.success("Membro removido");
      qc.invalidateQueries({ queryKey: ["team", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => update({ data: { team_id: teamId, name: editName.trim(), color: editColor } }),
    onSuccess: () => {
      toast.success("Equipe atualizada");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["team", teamId] });
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => del({ data: { team_id: teamId } }),
    onSuccess: () => {
      toast.success("Equipe excluída");
      qc.invalidateQueries({ queryKey: ["teams"] });
      navigate({ to: "/equipes" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLink = async () => {
    if (!lastInviteUrl) return;
    await navigator.clipboard.writeText(lastInviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  const { team, is_owner, members, pending_invites, projects } = data;

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-muted-foreground"
        >
          <Link to="/equipes">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Equipes
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${team.color}20`, color: team.color }}
          >
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{team.name}</h1>
            <p className="text-sm text-muted-foreground">
              {members.length} {members.length === 1 ? "membro" : "membros"} ·{" "}
              {projects.length} {projects.length === 1 ? "projeto" : "projetos"}
            </p>
          </div>
        </div>
        {is_owner && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditName(team.name);
              setEditColor(team.color);
              setEditOpen(true);
            }}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Editar
          </Button>
        )}
      </div>

      {/* Members */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Membros</h2>
        <div className="space-y-1.5">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {(m.display_name ?? m.email ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                    {m.display_name ?? m.email ?? "—"}
                    {m.is_me && <span className="text-xs text-muted-foreground">(você)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.role === "owner" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                    <Crown className="h-3 w-3" /> Dono
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Membro</span>
                )}
                {m.role !== "owner" && (is_owner || m.is_me) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(m.is_me ? "Sair da equipe?" : "Remover este membro?")) {
                        removeMut.mutate(m.user_id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {pending_invites.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3 w-3" /> Convites pendentes
          </h3>
          {pending_invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between rounded-md border border-dashed px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{inv.email}</span>
              </div>
              {is_owner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => revokeMut.mutate(inv.id)}
                >
                  Cancelar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {is_owner && (
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <Label className="text-xs">Convidar por e-mail</Label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && email.trim()) {
                  e.preventDefault();
                  inviteMut.mutate(email.trim());
                }
              }}
            />
            <Button
              onClick={() => inviteMut.mutate(email.trim())}
              disabled={!email.trim() || inviteMut.isPending}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              {inviteMut.isPending ? "Enviando…" : "Convidar"}
            </Button>
          </div>
          {lastInviteUrl && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Envie este link para a pessoa convidada:
              </p>
              <div className="flex gap-1.5">
                <Input value={lastInviteUrl} readOnly className="text-xs font-mono" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* Projects */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Projetos da equipe</h2>
        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nenhum projeto atribuído a esta equipe ainda.
              <br />
              No diálogo do projeto, escolha esta equipe em <strong>Visibilidade</strong>.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {projects.map((p: any) => (
              <Link
                key={p.id}
                to="/projetos/$id"
                params={{ id: p.id }}
                className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 hover:border-primary/40"
              >
                <FolderKanban className="h-4 w-4 shrink-0" style={{ color: p.color }} />
                <span className="text-sm font-medium truncate">{p.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {is_owner && (
        <div className="pt-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (
                window.confirm(
                  "Excluir esta equipe? Os projetos não serão removidos, mas perderão o vínculo com ela.",
                )
              ) {
                deleteMut.mutate();
              }
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Excluir equipe
          </Button>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar equipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-team-name">Nome</Label>
              <Input
                id="edit-team-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      editColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => updateMut.mutate()}
              disabled={!editName.trim() || updateMut.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
