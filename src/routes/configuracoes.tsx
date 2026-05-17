import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Check, Trash2, Plus, KeyRound, ExternalLink } from "lucide-react";
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

export const Route = createFileRoute("/configuracoes")({
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
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

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/mcp` : "";

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Integrações e tokens de acesso.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> Acesso para Claude (MCP)
                </CardTitle>
                <CardDescription>
                  Conecte o Claude (Desktop ou web) ao Foco para ele consultar e criar tarefas suas.
                </CardDescription>
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
                No Claude Desktop, em Settings → Connectors → Add custom connector, cole essa URL e o token gerado.
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
            ) : !data?.tokens.length ? (
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
      </div>

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
    </AppShell>
  );
}
