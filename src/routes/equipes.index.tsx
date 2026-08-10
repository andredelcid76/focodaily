import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Users, Plus, Crown, ArrowRight, UserPlus, User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AppShell } from "@/components/AppShell";
import { getTeamsOverview, createTeam, addTeamMembers } from "@/lib/teams.functions";
import { PROJECT_COLORS } from "@/hooks/useProjects";

export const Route = createFileRoute("/equipes/")({
  head: () => ({
    meta: [
      { title: "Equipes e pessoas — Focou" },
      {
        name: "description",
        content:
          "Gerencie suas equipes e veja todas as pessoas disponíveis para alocar em equipes ou projetos individuais.",
      },
      { property: "og:title", content: "Equipes e pessoas — Focou" },
      {
        property: "og:description",
        content: "Equipes, membros e pessoas disponíveis para alocação no Focou.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <EquipesPage />
    </AppShell>
  ),
});

type Person = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_me: boolean;
  team_ids: string[];
};

type PendingInvite = {
  id: string;
  email: string;
  expires_at: string;
  created_at: string;
};


function initials(p: Person) {
  const name = p.display_name ?? p.email ?? "";
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function EquipesPage() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getTeamsOverview);
  const create = useServerFn(createTeam);
  const addMembers = useServerFn(addTeamMembers);

  const { data, isLoading } = useQuery({
    queryKey: ["teams-overview"],
    queryFn: () => fetchOverview({ data: {} as never }),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  const [allocPerson, setAllocPerson] = useState<Person | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const invite = useServerFn(inviteContact);
  const revoke = useServerFn(revokeContactInvite);

  const inviteMut = useMutation({
    mutationFn: () =>
      invite({ data: { email: inviteEmail.trim(), origin: window.location.origin } }),
    onSuccess: () => {
      toast.success("Convite enviado");
      setInviteOpen(false);
      setInviteEmail("");
      qc.invalidateQueries({ queryKey: ["teams-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (invite_id: string) => revoke({ data: { invite_id } }),
    onSuccess: () => {
      toast.success("Convite cancelado");
      qc.invalidateQueries({ queryKey: ["teams-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const createMut = useMutation({
    mutationFn: () => create({ data: { name: name.trim(), color } }),
    onSuccess: () => {
      toast.success("Equipe criada");
      setOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["teams-overview"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allocMut = useMutation({
    mutationFn: (vars: { team_id: string; user_id: string }) =>
      addMembers({ data: { team_id: vars.team_id, user_ids: [vars.user_id] } }),
    onSuccess: () => {
      toast.success("Pessoa alocada na equipe");
      setAllocPerson(null);
      qc.invalidateQueries({ queryKey: ["teams-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const teams = (data?.teams ?? []) as any[];
  const people = useMemo(() => (data?.people ?? []) as Person[], [data]);
  const pendingInvites = (data?.pending_invites ?? []) as PendingInvite[];
  const ownedTeams = teams.filter((t) => t.is_owner);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "Equipe";

  const unassigned = people.filter((p) => p.team_ids.length === 0);
  const assigned = people.filter((p) => p.team_ids.length > 0);


  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Equipes e pessoas</h1>
          <p className="text-sm text-muted-foreground">
            Equipes agrupam pessoas para compartilhar projetos. Pessoas podem existir sem equipe e
            ser adicionadas individualmente a projetos.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nova equipe
        </Button>
      </div>

      {/* ---------------- Equipes ---------------- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Equipes ({teams.length})
          </h2>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : teams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">Nenhuma equipe ainda</h3>
                <p className="text-sm text-muted-foreground">
                  Crie uma equipe para compartilhar projetos com várias pessoas de uma vez.
                </p>
              </div>
              <Button onClick={() => setOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Criar primeira equipe
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {teams.map((t) => (
              <Link key={t.id} to="/equipes/$id" params={{ id: t.id }} className="group">
                <Card className="transition-all group-hover:border-primary/50 group-hover:shadow-sm">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${t.color}20`, color: t.color }}
                    >
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium truncate">{t.name}</h3>
                        {t.is_owner && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t.is_owner ? "Você é o dono" : "Membro"} · {t.member_count}{" "}
                        {t.member_count === 1 ? "pessoa" : "pessoas"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Pessoas ---------------- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Pessoas ({people.length})
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Convidar pessoa
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-5">
            <PeopleGroup
              title="Disponíveis para alocação (sem equipe)"
              hint="Pessoas convidadas livremente ou que colaboram com você em projetos, sem pertencer a nenhuma equipe."
              people={unassigned}
              teamName={teamName}
              canAllocate={ownedTeams.length > 0}
              onAllocate={setAllocPerson}
            />
            <PeopleGroup
              title="Já em equipes"
              people={assigned}
              teamName={teamName}
              canAllocate={ownedTeams.length > 0}
              onAllocate={setAllocPerson}
            />

            {pendingInvites.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  Convites pendentes{" "}
                  <span className="text-muted-foreground">({pendingInvites.length})</span>
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pendingInvites.map((inv) => (
                    <Card key={inv.id}>
                      <CardContent className="flex items-center gap-3 p-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">Aguardando aceite</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revokeMut.mutate(inv.id)}
                          disabled={revokeMut.isPending}
                        >
                          Cancelar
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Convidar pessoa */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar pessoa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              A pessoa recebe um convite por e-mail e passa a ficar disponível na sua lista — sem
              precisar entrar em nenhuma equipe. Depois você pode adicioná-la a projetos
              individuais ou a uma equipe.
            </p>
            <div>
              <Label htmlFor="invite-email">E-mail</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="pessoa@empresa.com"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => inviteMut.mutate()}
              disabled={!inviteEmail.trim() || inviteMut.isPending}
            >
              {inviteMut.isPending ? "Enviando…" : "Enviar convite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Nova equipe */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova equipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="team-name">Nome da equipe</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Marketing, Time Foco, Família"
                autoFocus
              />
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
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}>
              {createMut.isPending ? "Criando…" : "Criar equipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alocar pessoa */}
      <Dialog open={!!allocPerson} onOpenChange={(v) => !v && setAllocPerson(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Alocar {allocPerson?.display_name ?? allocPerson?.email ?? "pessoa"} em uma equipe
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {ownedTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Você precisa ser dono de uma equipe para alocar pessoas.
              </p>
            ) : (
              ownedTeams.map((t) => {
                const already = allocPerson?.team_ids.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={already || allocMut.isPending}
                    onClick={() =>
                      allocPerson &&
                      allocMut.mutate({ team_id: t.id, user_id: allocPerson.user_id })
                    }
                    className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 disabled:opacity-50"
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${t.color}20`, color: t.color }}
                    >
                      <Users className="h-4 w-4" />
                    </div>
                    <span className="flex-1 text-sm font-medium">{t.name}</span>
                    {already && <span className="text-xs text-muted-foreground">Já participa</span>}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PeopleGroup({
  title,
  hint,
  people,
  teamName,
  canAllocate,
  onAllocate,
}: {
  title: string;
  hint?: string;
  people: Person[];
  teamName: (id: string) => string;
  canAllocate: boolean;
  onAllocate: (p: Person) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">
          {title} <span className="text-muted-foreground">({people.length})</span>
        </h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém aqui.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {people.map((p) => (
            <Card key={p.user_id}>
              <CardContent className="flex items-center gap-3 p-3">
                <Avatar className="h-9 w-9">
                  {p.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}
                  <AvatarFallback className="text-xs">{initials(p)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">
                      {p.display_name ?? p.email ?? "Sem nome"}
                    </p>
                    {p.is_me && <Badge variant="secondary">você</Badge>}
                  </div>
                  {p.team_ids.length > 0 ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {p.team_ids.map(teamName).join(", ")}
                    </p>
                  ) : (
                    <p className="truncate text-xs text-muted-foreground">{p.email ?? "Sem equipe"}</p>
                  )}
                </div>
                {canAllocate && !p.is_me && (
                  <Button size="sm" variant="outline" onClick={() => onAllocate(p)}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    Alocar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
