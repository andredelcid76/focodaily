import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Mail, Trash2, Copy, Check, UserPlus, Clock, Crown, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listProjectMembers,
  inviteToProject,
  revokeInvite,
  removeProjectMember,
  updateProjectMemberRole,
} from "@/lib/team.functions";

type Props = { projectId: string };

type Role = "editor" | "viewer";

const ROLE_META: Record<"owner" | Role, { label: string; icon: typeof Crown; tone: string; hint: string }> = {
  owner: { label: "Dono", icon: Crown, tone: "bg-amber-500/10 text-amber-600", hint: "Tudo no projeto" },
  editor: { label: "Editor", icon: Pencil, tone: "bg-primary/10 text-primary", hint: "Cria e edita tarefas" },
  viewer: { label: "Leitor", icon: Eye, tone: "bg-muted text-muted-foreground", hint: "Somente leitura" },
};

export function ProjectMembersSection({ projectId }: Props) {
  const qc = useQueryClient();
  const fetchMembers = useServerFn(listProjectMembers);
  const invite = useServerFn(inviteToProject);
  const revoke = useServerFn(revokeInvite);
  const remove = useServerFn(removeProjectMember);
  const updateRole = useServerFn(updateProjectMemberRole);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => fetchMembers({ data: { project_id: projectId } }),
  });

  const inviteMut = useMutation({
    mutationFn: (vars: { email: string; role: Role }) =>
      invite({
        data: { project_id: projectId, email: vars.email, role: vars.role, origin: window.location.origin },
      }),
    onSuccess: (res) => {
      setEmail("");
      setLastInviteUrl(res.invite_url);
      toast.success(`Convite criado para ${res.email}`);
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { invite_id: id } }),
    onSuccess: () => {
      toast.success("Convite removido");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => remove({ data: { project_id: projectId, user_id: userId } }),
    onSuccess: () => {
      toast.success("Membro removido");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Optimistic role update
  const roleMut = useMutation({
    mutationFn: (vars: { user_id: string; role: Role }) =>
      updateRole({ data: { project_id: projectId, ...vars } }),
    onMutate: async (vars) => {
      const key = ["project-members", projectId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<any>(key);
      if (prev?.members) {
        qc.setQueryData(key, {
          ...prev,
          members: prev.members.map((m: any) =>
            m.user_id === vars.user_id ? { ...m, role: vars.role } : m,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["project-members", projectId], ctx.prev);
      toast.error("Não consegui mudar o papel");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["project-members", projectId] }),
  });

  const copyLink = async () => {
    if (!lastInviteUrl) return;
    await navigator.clipboard.writeText(lastInviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando membros…</p>;

  const isOwner = data?.is_owner ?? false;
  const members = data?.members ?? [];
  const invites = data?.pending_invites ?? [];

  return (
    <div className="space-y-4">
      <Separator />
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Membros do projeto</h3>
        <span className="text-xs text-muted-foreground">({members.length})</span>
      </div>

      <div className="space-y-1.5">
        {members.map((m) => {
          const meta = ROLE_META[m.role as "owner" | Role] ?? ROLE_META.editor;
          const Icon = meta.icon;
          const canEditRole = isOwner && m.role !== "owner";
          const canRemove = (isOwner && m.role !== "owner") || (m.is_me && m.role !== "owner");
          return (
            <div
              key={m.user_id}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2 transition-colors hover:bg-card/70"
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
                {canEditRole ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) => roleMut.mutate({ user_id: m.user_id, role: v as Role })}
                  >
                    <SelectTrigger className="h-7 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">
                        <span className="flex items-center gap-2"><Pencil className="h-3 w-3" /> Editor</span>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <span className="flex items-center gap-2"><Eye className="h-3 w-3" /> Leitor</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.tone}`} title={meta.hint}>
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                )}
                {canRemove && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(m.is_me ? "Sair do projeto?" : "Remover este membro?")) {
                        removeMut.mutate(m.user_id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {invites.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3 w-3" /> Convites pendentes
          </div>
          {invites.map((inv: any) => {
            const r = (inv.role ?? "editor") as Role;
            const m = ROLE_META[r];
            const I = m.icon;
            return (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-md border border-dashed px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{inv.email}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.tone}`}>
                    <I className="h-2.5 w-2.5" /> {m.label}
                  </span>
                </div>
                {isOwner && (
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
            );
          })}
        </div>
      )}

      {isOwner && (
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <Label className="text-xs">Convidar por e-mail</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 min-w-[180px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && email.trim()) {
                  e.preventDefault();
                  inviteMut.mutate({ email: email.trim(), role: inviteRole });
                }
              }}
            />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">
                  <span className="flex items-center gap-2"><Pencil className="h-3 w-3" /> Editor</span>
                </SelectItem>
                <SelectItem value="viewer">
                  <span className="flex items-center gap-2"><Eye className="h-3 w-3" /> Leitor</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => inviteMut.mutate({ email: email.trim(), role: inviteRole })}
              disabled={!email.trim() || inviteMut.isPending}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              {inviteMut.isPending ? "Enviando…" : "Convidar"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            <strong>Editor</strong> cria e edita tarefas. <strong>Leitor</strong> só visualiza.
          </p>
          {lastInviteUrl && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Envie este link para a pessoa convidada:</p>
              <div className="flex gap-1.5">
                <Input value={lastInviteUrl} readOnly className="text-xs font-mono" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
