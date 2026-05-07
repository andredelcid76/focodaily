import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Inbox, Mail, Users, Briefcase, Check, X, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { listInboxSuggestions, dismissInboxSuggestion, acceptInboxSuggestion, triggerInboxScan } from "@/lib/inbox.functions";
import { useAuth } from "@/lib/auth";
import { useProjects } from "@/hooks/useProjects";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
});

const SOURCE_META = {
  email: { icon: Mail, label: "E-mail", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  meeting: { icon: Users, label: "Reunião", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  pipedrive: { icon: Briefcase, label: "Pipedrive", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
} as const;

function InboxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listInboxSuggestions);
  const dismiss = useServerFn(dismissInboxSuggestion);
  const accept = useServerFn(acceptInboxSuggestion);
  const scan = useServerFn(triggerInboxScan);

  const { projects } = useProjects(user?.id);

  const { data, isLoading } = useQuery({
    queryKey: ["inbox-suggestions"],
    queryFn: () => list(),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => dismiss({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox-suggestions"] }),
  });

  const acceptMut = useMutation({
    mutationFn: (input: { id: string; scheduled_date: string; project_id: string | null; title: string }) =>
      accept({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-suggestions"] });
      toast.success("Tarefa adicionada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const scanMut = useMutation({
    mutationFn: () => scan(),
    onSuccess: (r: unknown) => {
      const created = (r as { results?: Array<{ created?: number }> })?.results?.[0]?.created ?? 0;
      toast.success(created > 0 ? `${created} nova(s) sugestão(ões)` : "Nada novo encontrado");
      qc.invalidateQueries({ queryKey: ["inbox-suggestions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no scan"),
  });

  const suggestions = data?.suggestions ?? [];
  const lastScan = data?.state?.last_scan_at;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Inbox className="h-6 w-6" /> Caixa de entrada
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sugestões automáticas vindas de e-mails, reuniões e Pipedrive.
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
        <div className="space-y-3">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s as unknown as SuggestionRow}
              projects={projects}
              onDismiss={() => dismissMut.mutate(s.id)}
              onAccept={(input) => acceptMut.mutate({ id: s.id, ...input })}
              isAccepting={acceptMut.isPending}
              isDismissing={dismissMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type SuggestionRow = {
  id: string;
  title: string;
  description: string | null;
  source: "email" | "meeting" | "pipedrive";
  source_label: string | null;
  source_url: string | null;
  source_date: string | null;
  suggested_category: string;
  suggested_date: string | null;
  reasoning: string | null;
};

function SuggestionCard({
  suggestion,
  projects,
  onDismiss,
  onAccept,
  isAccepting,
  isDismissing,
}: {
  suggestion: SuggestionRow;
  projects: Array<{ id: string; name: string; color: string }>;
  onDismiss: () => void;
  onAccept: (input: { scheduled_date: string; project_id: string | null; title: string }) => void;
  isAccepting: boolean;
  isDismissing: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(suggestion.suggested_date ?? today);
  const [projectId, setProjectId] = useState<string>("none");
  const [title, setTitle] = useState(suggestion.title);

  const meta = SOURCE_META[suggestion.source];
  const Icon = meta.icon;

  return (
    <Card className="p-4 space-y-3 hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-medium border-0 px-0 h-auto py-0 text-base focus-visible:ring-0 shadow-none bg-transparent"
          />
          {suggestion.description && (
            <p className="text-sm text-muted-foreground mt-1">{suggestion.description}</p>
          )}
        </div>
        <Badge variant="outline" className={meta.color}>
          <Icon className="h-3 w-3 mr-1" /> {meta.label}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
        <span className="truncate max-w-md">{suggestion.source_label}</span>
        {suggestion.source_url && (
          <a href={suggestion.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {suggestion.reasoning && (
          <>
            <span>·</span>
            <span className="italic">{suggestion.reasoning}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto h-9"
        />
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem projeto</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            disabled={isDismissing || isAccepting}
          >
            <X className="h-4 w-4 mr-1" /> Descartar
          </Button>
          <Button
            size="sm"
            onClick={() => onAccept({ scheduled_date: date, project_id: projectId === "none" ? null : projectId, title })}
            disabled={isAccepting || isDismissing || !title.trim()}
          >
            <Check className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
      </div>
    </Card>
  );
}
