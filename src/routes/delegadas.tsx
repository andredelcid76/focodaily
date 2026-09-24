import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { UserCheck, CalendarDays, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listMyAssignedTasks, type MyTaskRow } from "@/lib/myTasks.functions";
import { PriorityBadge, toPriority } from "@/components/PriorityBadge";
import { useAuth } from "@/lib/auth";
import { useProfiles } from "@/hooks/useProfiles";

export const Route = createFileRoute("/delegadas")({
  head: () => ({
    meta: [
      { title: "Tarefas delegadas para mim | Foco" },
      {
        name: "description",
        content:
          "Veja as tarefas que outras pessoas atribuíram a você, aceite escolhendo a data e acompanhe o que está em andamento.",
      },
      { property: "og:title", content: "Tarefas delegadas para mim | Foco" },
      {
        property: "og:description",
        content: "Tarefas atribuídas a você por colegas, com data e prioridade em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <DelegatedPage />
    </AppShell>
  ),
});

const STATUS_LABEL: Record<string, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  in_progress: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
};

function DelegatedPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchTasks = useServerFn(listMyAssignedTasks);
  const [dates, setDates] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["my-assigned-tasks"],
    queryFn: () => fetchTasks(),
    enabled: !!user,
  });

  const [tab, setTab] = useState<"mine" | "byme">("mine");
  const allRows = useMemo<MyTaskRow[]>(
    () =>
      Array.isArray(data)
        ? (data as MyTaskRow[])
        : ((data as { tasks?: MyTaskRow[] } | undefined)?.tasks ?? []),
    [data],
  );
  const delegated = useMemo(
    () => allRows.filter((t) => t.kind === "delegated" && !t.completed),
    [allRows],
  );
  const byMe = useMemo(
    () =>
      allRows.filter(
        (t) =>
          t.user_id === user?.id && !!t.assignee_id && t.assignee_id !== user?.id && !t.completed,
      ),
    [allRows, user?.id],
  );
  const assigneeProfiles = useProfiles(byMe.map((t) => t.assignee_id));

  const backlog = delegated.filter((t) => !t.scheduled_date);
  const scheduled = delegated.filter((t) => t.scheduled_date);
  const byMeBacklog = byMe.filter((t) => !t.scheduled_date);
  const byMeScheduled = byMe.filter((t) => t.scheduled_date);

  const renderByMe = (t: MyTaskRow) => {
    const p = t.assignee_id ? assigneeProfiles.get(t.assignee_id) : undefined;
    return (
      <Card key={t.id} className="p-4 space-y-2">
        <div className="font-medium">{t.title}</div>
        {t.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Para {p?.display_name ?? p?.email ?? "—"}</span>
          {t.project && (
            <Badge variant="outline" className="text-[10px]">
              {t.project.name}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {STATUS_LABEL[t.status] ?? t.status}
          </Badge>
          <PriorityBadge priority={toPriority(t.priority)} size="xs" />
          {t.scheduled_date && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> {t.scheduled_date}
            </span>
          )}
        </div>
      </Card>
    );
  };

  const scheduleMut = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("tasks").update({ scheduled_date: date }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Tarefa agendada");
      qc.invalidateQueries({ queryKey: ["my-assigned-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao agendar"),
  });

  const completeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ completed: true, status: "done", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Tarefa concluída");
      qc.invalidateQueries({ queryKey: ["my-assigned-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const renderTask = (t: MyTaskRow) => {
    const today = new Date().toISOString().slice(0, 10);
    return (
      <Card key={t.id} className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.title}</div>
            {t.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {t.delegated_by_name && <span>Delegada por {t.delegated_by_name}</span>}
              {t.project && (
                <Badge variant="outline" className="text-[10px]">
                  {t.project.name}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {STATUS_LABEL[t.status] ?? t.status}
              </Badge>
              <PriorityBadge priority={toPriority(t.priority)} size="xs" />
              {t.scheduled_date && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {t.scheduled_date}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="h-8 w-[9.5rem]"
                value={dates[t.id] ?? t.scheduled_date ?? today}
                onChange={(e) => setDates((prev) => ({ ...prev, [t.id]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={scheduleMut.isPending}
                onClick={() =>
                  scheduleMut.mutate({ id: t.id, date: dates[t.id] ?? t.scheduled_date ?? today })
                }
              >
                {t.scheduled_date ? "Reagendar" : "Aceitar e agendar"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {t.project && (
                <Button asChild variant="ghost" size="sm">
                  <a href={`/projetos/${t.project.id}`}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> Projeto
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={completeMut.isPending}
                onClick={() => completeMut.mutate(t.id)}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Concluir
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserCheck className="h-6 w-6" /> Delegadas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tab === "mine"
            ? "Tarefas que outras pessoas atribuíram a você. Escolha a data para ela entrar no seu dia."
            : "Tarefas que você atribuiu a outras pessoas e ainda não foram concluídas."}
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-border/60 p-0.5">
          <Button size="sm" variant={tab === "mine" ? "secondary" : "ghost"} onClick={() => setTab("mine")}>
            Para mim · {delegated.length}
          </Button>
          <Button size="sm" variant={tab === "byme" ? "secondary" : "ghost"} onClick={() => setTab("byme")}>
            Que eu deleguei · {byMe.length}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : tab === "byme" ? (
        byMe.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">Você não tem tarefas delegadas em aberto.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {byMeBacklog.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Ainda sem data · {byMeBacklog.length}
                </h2>
                <div className="space-y-3">{byMeBacklog.map(renderByMe)}</div>
              </section>
            )}
            {byMeScheduled.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Já agendadas · {byMeScheduled.length}
                </h2>
                <div className="space-y-3">{byMeScheduled.map(renderByMe)}</div>
              </section>
            )}
          </div>
        )
      ) : delegated.length === 0 ? (
        <Card className="p-12 text-center">
          <UserCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhuma tarefa delegada para você.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {backlog.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Aguardando você agendar · {backlog.length}
              </h2>
              <div className="space-y-3">{backlog.map(renderTask)}</div>
            </section>
          )}
          {scheduled.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Já agendadas · {scheduled.length}
              </h2>
              <div className="space-y-3">{scheduled.map(renderTask)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
