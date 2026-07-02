import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  Check,
  Trash2,
  Plus,
  KeyRound,
  ExternalLink,
  Mail,
  Briefcase,
  Mic,
  Link2,
  Unlink,
  UserCircle,
  Plug,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { RolesInner } from "@/routes/papeis";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listMcpTokens,
  createMcpToken,
  revokeMcpToken,
  deleteMcpToken,
} from "@/lib/mcpTokens.functions";
import {
  getIntegrationsStatus,
  savePipedriveConnection,
  disconnectPipedrive,
  saveFirefliesConnection,
  disconnectFireflies,
  testPipedriveConnection,
  testFirefliesConnection,
} from "@/lib/integrations.functions";
import { getOutlookAuthUrl, disconnectOutlook, testOutlookConnection } from "@/lib/outlook.functions";

import { ProfileCard } from "@/components/ProfileCard";
import { AccentColorCard } from "@/components/AccentColorCard";

const PUBLISHED_MCP_URL = "https://focodaily.lovable.app/api/public/mcp";

export const Route = createFileRoute("/configuracoes")({
  component: IntegracoesPage,
});

function IntegracoesPage() {
  return (
    <AppShell>
      <IntegracoesInner />
    </AppShell>
  );
}

function IntegracoesInner() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getIntegrationsStatus);
  const { user } = useAuth();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => fetchStatus(),
    retry: false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["integrations-status"] });

  const [tab, setTab] = useState("perfil");

  const tabs = [
    { value: "perfil", label: "Perfil", icon: UserCircle },
    { value: "papeis", label: "Papéis", icon: ShieldCheck },
    { value: "integracoes", label: "Integrações", icon: Plug },
    { value: "avancado", label: "Avançado", icon: Settings2 },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Seu perfil, papéis, integrações e acessos avançados. Tudo isolado por usuário.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-5">
          <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-grid">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5"
            >
              <TabsContent value="perfil" className="mt-0 space-y-5">
                <ProfileCard />
              </TabsContent>

              <TabsContent value="papeis" className="mt-0 space-y-5">
                {user ? <RolesInner userId={user.id} /> : null}
              </TabsContent>

              <TabsContent value="integracoes" className="mt-0 space-y-5">
                <OutlookCard status={status?.outlook} loading={statusLoading} onChanged={invalidate} />
                <PipedriveCard status={status?.pipedrive} loading={statusLoading} onChanged={invalidate} />
                <FirefliesCard status={status?.fireflies} loading={statusLoading} onChanged={invalidate} />
              </TabsContent>

              <TabsContent value="avancado" className="mt-0 space-y-5">
                <McpCard />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>
  );
}

// ----------------- Outlook -----------------
function OutlookCard({
  status,
  loading,
  onChanged,
}: {
  status?: { connected: boolean; email?: string | null; display_name?: string | null; last_sync_at?: string | null };
  loading: boolean;
  onChanged: () => void;
}) {
  const getAuthUrl = useServerFn(getOutlookAuthUrl);
  const disconnect = useServerFn(disconnectOutlook);
  const test = useServerFn(testOutlookConnection);
  const [connecting, setConnecting] = useState(false);
  const testMut = useMutation({
    mutationFn: () => test({ data: {} }),
    onSuccess: (r) => toast.success(`Conexão OK${r.email ? ` — ${r.email}` : ""}`),
    onError: (e: Error) => toast.error(`Falhou: ${e.message}`),
  });

  const onConnect = async () => {
    setConnecting(true);
    try {
      const res = await getAuthUrl({ data: { origin: window.location.origin } });
      window.location.href = res.url;
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  };

  const onDisconnect = async () => {
    try {
      await disconnect({ data: {} });
      toast.success("Outlook desconectado");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Microsoft Outlook</CardTitle>
              <CardDescription>
                E-mails, calendário e tarefas. Usado para varrer a caixa de entrada e sincronizar a agenda.
              </CardDescription>
            </div>
          </div>
          {status?.connected ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
              Conectado
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : status?.connected ? (
          <>
            <div className="text-sm">
              Conectado como <span className="font-medium">{status.email ?? status.display_name ?? "—"}</span>
              {status.last_sync_at && (
                <span className="text-muted-foreground">
                  {" "}· última sincronização {new Date(status.last_sync_at).toLocaleString("pt-BR")}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
                {testMut.isPending ? "Testando…" : "Testar conexão"}
              </Button>
              <Button variant="outline" size="sm" onClick={onDisconnect}>
                <Unlink className="mr-1.5 h-4 w-4" /> Desconectar
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={onConnect} disabled={connecting}>
            <Link2 className="mr-1.5 h-4 w-4" /> {connecting ? "Abrindo…" : "Conectar Outlook"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------- Pipedrive -----------------
function PipedriveCard({
  status,
  loading,
  onChanged,
}: {
  status?: { connected: boolean; domain?: string; last_sync_at?: string | null };
  loading: boolean;
  onChanged: () => void;
}) {
  const save = useServerFn(savePipedriveConnection);
  const disconnect = useServerFn(disconnectPipedrive);
  const test = useServerFn(testPipedriveConnection);
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const testMut = useMutation({
    mutationFn: () => test({ data: undefined }),
    onSuccess: (r) => toast.success(`Conexão OK${r.email ? ` — ${r.email}` : r.name ? ` — ${r.name}` : ""}`),
    onError: (e: Error) => toast.error(`Falhou: ${e.message}`),
  });

  const saveMut = useMutation({
    mutationFn: () => save({ data: { domain: domain.trim(), api_token: token.trim() } }),
    onSuccess: () => {
      toast.success("Pipedrive conectado");
      setOpen(false);
      setDomain("");
      setToken("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDisconnect = async () => {
    try {
      await disconnect({ data: undefined });
      toast.success("Pipedrive desconectado");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Pipedrive</CardTitle>
              <CardDescription>
                Atividades do CRM viram tarefas pendentes na caixa de entrada.
              </CardDescription>
            </div>
          </div>
          {status?.connected ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
              Conectado
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : status?.connected ? (
          <>
            <div className="text-sm">
              Domínio: <span className="font-mono">{status.domain}.pipedrive.com</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
                {testMut.isPending ? "Testando…" : "Testar conexão"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                Atualizar token
              </Button>
              <Button variant="outline" size="sm" onClick={onDisconnect}>
                <Unlink className="mr-1.5 h-4 w-4" /> Desconectar
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={() => setOpen(true)}>
            <Link2 className="mr-1.5 h-4 w-4" /> Conectar Pipedrive
          </Button>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar Pipedrive</DialogTitle>
            <DialogDescription>
              Pegue seu token em Pipedrive → Configurações pessoais → API.{" "}
              <a
                href="https://support.pipedrive.com/en/article/how-can-i-find-my-personal-api-key"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Como encontrar <ExternalLink className="h-3 w-3" />
              </a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pd-domain">Domínio da sua conta</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="pd-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="minhaempresa"
                  autoComplete="off"
                />
                <span className="text-sm text-muted-foreground">.pipedrive.com</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pd-token">API token</Label>
              <Input
                id="pd-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
                type="password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={!domain.trim() || !token.trim() || saveMut.isPending}
            >
              {saveMut.isPending ? "Validando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ----------------- Fireflies -----------------
function FirefliesCard({
  status,
  loading,
  onChanged,
}: {
  status?: { connected: boolean; updated_at?: string };
  loading: boolean;
  onChanged: () => void;
}) {
  const save = useServerFn(saveFirefliesConnection);
  const disconnect = useServerFn(disconnectFireflies);
  const test = useServerFn(testFirefliesConnection);
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const testMut = useMutation({
    mutationFn: () => test({ data: undefined }),
    onSuccess: (r) => toast.success(`Conexão OK${r.email ? ` — ${r.email}` : r.name ? ` — ${r.name}` : ""}`),
    onError: (e: Error) => toast.error(`Falhou: ${e.message}`),
  });

  const saveMut = useMutation({
    mutationFn: () => save({ data: { api_key: apiKey.trim() } }),
    onSuccess: () => {
      toast.success("Fireflies conectado");
      setOpen(false);
      setApiKey("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDisconnect = async () => {
    try {
      await disconnect({ data: undefined });
      toast.success("Fireflies desconectado");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-orange-500/10 p-2 text-orange-600">
              <Mic className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Fireflies</CardTitle>
              <CardDescription>
                Action items das suas atas de reunião viram sugestões de tarefa.
              </CardDescription>
            </div>
          </div>
          {status?.connected ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
              Conectado
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : status?.connected ? (
          <>
            <div className="text-sm text-muted-foreground">
              Chave salva em {status.updated_at ? new Date(status.updated_at).toLocaleDateString("pt-BR") : "—"}.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
                {testMut.isPending ? "Testando…" : "Testar conexão"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                Atualizar chave
              </Button>
              <Button variant="outline" size="sm" onClick={onDisconnect}>
                <Unlink className="mr-1.5 h-4 w-4" /> Desconectar
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={() => setOpen(true)}>
            <Link2 className="mr-1.5 h-4 w-4" /> Conectar Fireflies
          </Button>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar Fireflies</DialogTitle>
            <DialogDescription>
              Pegue sua API key em Fireflies → Settings → Developer Settings.{" "}
              <a
                href="https://docs.fireflies.ai/getting-started/quickstart"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Como gerar <ExternalLink className="h-3 w-3" />
              </a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ff-key">API key</Label>
            <Input
              id="ff-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              autoComplete="off"
              type="password"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={!apiKey.trim() || saveMut.isPending}
            >
              {saveMut.isPending ? "Validando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ----------------- MCP tokens (kept) -----------------
function McpCard() {
  const qc = useQueryClient();
  const list = useServerFn(listMcpTokens);
  const create = useServerFn(createMcpToken);
  const revoke = useServerFn(revokeMcpToken);
  const remove = useServerFn(deleteMcpToken);

  const { data, isLoading, error } = useQuery({
    queryKey: ["mcp-tokens"],
    queryFn: async () => {
      const res = await list();
      return res ?? { tokens: [] };
    },
    retry: false,
  });

  const [label, setLabel] = useState("Claude");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const createMut = useMutation({
    mutationFn: (l: string) => create({ data: { label: l } }),
    onSuccess: (res) => {
      setNewToken(res.token);
      qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Token revogado");
      qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Token excluído");
      qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
  });

  const mcpUrl = PUBLISHED_MCP_URL;

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2 text-purple-600">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Acesso para Claude (MCP)</CardTitle>
                <CardDescription>
                  Conecte o Claude (Desktop ou web) ao Foco para consultar e criar suas tarefas.
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setNewToken(null);
                setLabel("Claude");
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Gerar token
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <div className="mb-1 font-medium">URL do MCP server</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate font-mono text-[11px]">{mcpUrl}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(mcpUrl)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="mt-2 text-muted-foreground">
              No Claude Desktop ou Web, adicione um custom connector usando essa URL publicada e o token gerado.
            </p>
            <a
              href="https://modelcontextprotocol.io/quickstart/user"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
            >
              Como conectar <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : error ? (
            <p className="text-sm text-destructive">
              Não foi possível carregar os tokens: {(error as Error).message}
            </p>
          ) : !data?.tokens?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum token criado ainda.</p>
          ) : (
            <div className="space-y-2">
              {data.tokens.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.label}</span>
                      {t.revoked_at && (
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                          revogado
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {t.token_prefix}…
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Criado {new Date(t.created_at).toLocaleDateString("pt-BR")}
                      {t.last_used_at &&
                        ` · Último uso ${new Date(t.last_used_at).toLocaleString("pt-BR")}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!t.revoked_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revokeMut.mutate(t.id)}
                      >
                        Revogar
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir token?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Qualquer cliente usando esse token perderá acesso imediatamente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMut.mutate(t.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setNewToken(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newToken ? "Token criado" : "Novo token MCP"}</DialogTitle>
            <DialogDescription>
              {newToken
                ? "Copie agora — não dá pra ver de novo depois de fechar."
                : "Dê um nome pro token (ex: Claude do meu MacBook)."}
            </DialogDescription>
          </DialogHeader>
          {newToken ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <code className="block break-all font-mono text-xs">{newToken}</code>
              </div>
              <Button onClick={() => copy(newToken)} className="w-full" variant="outline">
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" /> Copiar token
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
            </div>
          )}
          <DialogFooter>
            {newToken ? (
              <Button onClick={() => setDialogOpen(false)}>Pronto</Button>
            ) : (
              <Button
                onClick={() => createMut.mutate(label)}
                disabled={!label.trim() || createMut.isPending}
              >
                {createMut.isPending ? "Gerando…" : "Gerar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
