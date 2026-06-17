import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Inbox, Mail, Users, Briefcase, X, ExternalLink, RefreshCw, Loader2, Plus, Pencil, RotateCcw, History, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { fetchInboxSuggestions, dismissSuggestion, acceptSuggestion, triggerScan, reactivateSuggestion, type InboxSuggestion } from "@/lib/inboxClient";
import { useAuth } from "@/lib/auth";
import { useProjects } from "@/hooks/useProjects";
import { useRoles } from "@/hooks/useRoles";
import { TaskDialog } from "@/components/TaskDialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/inbox")({
  component: () => (
    <AppShell>
      <InboxPage />
    </AppShell>
  ),
});

const SOURCE_META = {
  email: { icon: Mail, label: "Outlook", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  meeting: { icon: Users, label: "Fireflies", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  pipedrive: { icon: Briefcase, label: "Pipedrive", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
} as const;

type SourceKey = keyof typeof SOURCE_META;

function InboxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  const { projects } = useProjects(userId);
  const { roles } = useRoles(userId);

  const [editing, setEditing] = useState<InboxSuggestion | null>(null);
  const [tab, setTab] = useState<"all" | SourceKey>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["inbox-suggestions", userId],
    queryFn: () => fetchInboxSuggestions(userId!),
    enabled: !!userId,
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => dismissSuggestion(id, userId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox-suggestions"] }),
  });

  const scanMut = useMutation({
    mutationFn: () => triggerScan(userId!),
    onSuccess: (r: unknown) => {
      const created = (r as { results?: Array<{ created?: number }> })?.results?.[0]?.created ?? 0;
      toast.success(created > 0 ? `${created} nova(s) sugestão(ões)` : "Nada novo encontrado");
      qc.invalidateQueries({ queryKey: ["inbox-suggestions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no scan"),
  });

  const suggestions = data?.suggestions ?? [];
  const history = (data as { history?: (InboxSuggestion & { status: string; acted_at: string | null })[] })?.history ?? [];
  const lastScan = data?.state?.last_scan_at;

  const reactivateMut = useMutation({
    mutationFn: (id: string) => reactivateSuggestion(id, userId!),
    onSuccess: () => {
      toast.success("Sugestão reativada");
      qc.invalidateQueries({ queryKey: ["inbox-suggestions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const acceptMut = useMutation({
    mutationFn: async (s: InboxSuggestion) => {
      const date = s.suggested_date ?? new Date().toISOString().slice(0, 10);
      return acceptSuggestion({
        id: s.id,
        userId: userId!,
        task: {
          title: s.title,
          description: s.description,
          scheduled_date: date,
          duration_minutes: s.suggested_duration_minutes,
          category: s.suggested_category,
          project_id: null,
          role_id: null,
          non_negotiable: false,
        },
      });
    },
    onSuccess: () => {
      toast.success("Tarefa adicionada");
      qc.invalidateQueries({ queryKey: ["inbox-suggestions"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao adicionar tarefa"),
  });

  const counts = useMemo(() => {
    const c: Record<SourceKey, number> = { email: 0, meeting: 0, pipedrive: 0 };
    for (const s of suggestions) c[s.source] = (c[s.source] ?? 0) + 1;
    return c;
  }, [suggestions]);

  const visible = tab === "all" ? suggestions : suggestions.filter((s) => s.source === tab);

  const renderCard = (s: InboxSuggestion) => {
    const meta = SOURCE_META[s.source];
    const Icon = meta.icon;
    return (
      <Card key={s.id} className="p-4 space-y-2 hover:border-border transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-base">{s.title}</div>
            {s.description && <p className="text-sm text-muted-foreground mt-1">{s.description}</p>}
          </div>
          <Badge variant="outline" className={meta.color}>
            <Icon className="h-3 w-3 mr-1" /> {meta.label}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="truncate max-w-md">{s.source_label}</span>
          {s.source_url && (
            <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {s.reasoning && (
            <>
              <span>·</span>
              <span className="italic">{s.reasoning}</span>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => dismissMut.mutate(s.id)} disabled={dismissMut.isPending}>
            <X className="h-4 w-4 mr-1" /> Descartar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button size="sm" onClick={() => acceptMut.mutate(s)} disabled={acceptMut.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Inbox className="h-6 w-6" /> Caixa de entrada
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sugestões vindas do Outlook, Fireflies e Pipedrive.
            {lastScan && (
              <> Última varredura {formatDistanceToNow(new Date(lastScan), { addSuffix: true, locale: ptBR })}.</>
            )}
          </p>
        </div>
        <Button onClick={() => scanMut.mutate()} disabled={scanMut.isPending} variant="outline" size="sm">
          {scanMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Buscar agora
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Carregando…</div>
      ) : suggestions.length === 0 ? (
        <Card className="p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhuma sugestão pendente.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">A varredura automática roda a cada 2 horas.</p>
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">Todas <Badge variant="secondary" className="ml-2">{suggestions.length}</Badge></TabsTrigger>
            <TabsTrigger value="email"><Mail className="h-3.5 w-3.5 mr-1.5" />Outlook <Badge variant="secondary" className="ml-2">{counts.email}</Badge></TabsTrigger>
            <TabsTrigger value="meeting"><Users className="h-3.5 w-3.5 mr-1.5" />Fireflies <Badge variant="secondary" className="ml-2">{counts.meeting}</Badge></TabsTrigger>
            <TabsTrigger value="pipedrive"><Briefcase className="h-3.5 w-3.5 mr-1.5" />Pipedrive <Badge variant="secondary" className="ml-2">{counts.pipedrive}</Badge></TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            <div className="space-y-3">
              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma sugestão nesta origem.</p>
              ) : (
                visible.map(renderCard)
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {history.length > 0 && (
        <div className="pt-2 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <History className="h-4 w-4" /> Histórico recente
            <span className="text-xs text-muted-foreground/70 font-normal">(últimas {history.length})</span>
          </div>
          <div className="space-y-2">
            {history.map((h) => {
              const meta = SOURCE_META[h.source];
              const Icon = meta.icon;
              const isAccepted = h.status === "accepted";
              return (
                <Card key={h.id} className="p-3 flex items-start justify-between gap-3 opacity-75 hover:opacity-100 transition-opacity">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={meta.color}>
                        <Icon className="h-3 w-3 mr-1" /> {meta.label}
                      </Badge>
                      {isAccepted ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Aceita
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          <X className="h-3 w-3 mr-1" /> Descartada
                        </Badge>
                      )}
                      {h.acted_at && (
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(h.acted_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate mt-1">{h.title}</div>
                    {h.source_label && (
                      <div className="text-xs text-muted-foreground truncate">{h.source_label}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {h.source_url && (
                      <Button asChild variant="ghost" size="sm">
                        <a href={h.source_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    {!isAccepted && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => reactivateMut.mutate(h.id)}
                        disabled={reactivateMut.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reativar
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {editing && userId && (
        <TaskDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          defaultDate={editing.suggested_date ?? new Date().toISOString().slice(0, 10)}
          isSeed
          task={
            {
              title: editing.title,
              description: editing.description,
              category: editing.suggested_category,
              duration_minutes: editing.suggested_duration_minutes,
              scheduled_date: editing.suggested_date ?? new Date().toISOString().slice(0, 10),
              recurrence: "none",
              role_id: null,
              project_id: null,
              non_negotiable: false,
            } as never
          }
          roles={roles}
          projects={projects}
          onSave={async (d) => {
            await acceptSuggestion({
              id: editing.id,
              userId,
              task: {
                title: d.title,
                description: d.description,
                scheduled_date: d.scheduled_date,
                duration_minutes: d.duration_minutes,
                category: d.category,
                project_id: d.project_id,
                role_id: d.role_id,
                non_negotiable: d.non_negotiable,
              },
            });
            qc.invalidateQueries({ queryKey: ["inbox-suggestions"] });
            qc.invalidateQueries({ queryKey: ["tasks"] });
            toast.success("Tarefa adicionada");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
