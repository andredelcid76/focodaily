import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Users, Plus, Crown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/AppShell";
import { listTeams, createTeam } from "@/lib/teams.functions";
import { PROJECT_COLORS } from "@/hooks/useProjects";

export const Route = createFileRoute("/equipes/")({
  component: () => (
    <AppShell>
      <EquipesPage />
    </AppShell>
  ),
});

function EquipesPage() {
  const qc = useQueryClient();
  const fetchTeams = useServerFn(listTeams);
  const create = useServerFn(createTeam);

  const { data, isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => fetchTeams(),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  const createMut = useMutation({
    mutationFn: () => create({ data: { name: name.trim(), color } }),
    onSuccess: () => {
      toast.success("Equipe criada");
      setOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const teams = data?.teams ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Equipes</h1>
          <p className="text-sm text-muted-foreground">
            Crie uma equipe uma vez e atribua projetos a ela. Todos os membros entram no projeto
            automaticamente.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nova equipe
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
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
          {teams.map((t: any) => (
            <Link
              key={t.id}
              to="/equipes/$id"
              params={{ id: t.id }}
              className="group"
            >
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
                      {t.is_owner && (
                        <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.is_owner ? "Você é o dono" : "Membro"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

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
            <Button
              onClick={() => createMut.mutate()}
              disabled={!name.trim() || createMut.isPending}
            >
              {createMut.isPending ? "Criando…" : "Criar equipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
