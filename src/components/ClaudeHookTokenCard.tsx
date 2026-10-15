import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Check, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listMcpTokens, createMcpToken, revokeMcpToken } from "@/lib/mcpTokens.functions";

export const CLAUDE_HOOK_LABEL = "Claude Code (sinal de atividade)";

export function ClaudeHookTokenCard() {
  const qc = useQueryClient();
  const list = useServerFn(listMcpTokens);
  const create = useServerFn(createMcpToken);
  const revoke = useServerFn(revokeMcpToken);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({ queryKey: ["mcp-tokens"], queryFn: () => list() });
  const active = (data?.tokens ?? []).filter((t) => t.label === CLAUDE_HOOK_LABEL && !t.revoked_at);

  const revokeAll = async () => {
    for (const t of active) await revoke({ data: { id: t.id } });
  };

  const genMut = useMutation({
    mutationFn: async () => {
      await revokeAll();
      return create({ data: { label: CLAUDE_HOOK_LABEL } });
    },
    onSuccess: (res) => {
      setNewToken(res.token);
      qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: revokeAll,
    onSuccess: () => {
      setNewToken(null);
      toast.success("Token revogado");
      qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
  });

  const current = active[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Token do Claude Code (sinal de atividade)</CardTitle>
            <CardDescription>
              Usado pelo script do Claude Code para avisar o Foco que você está trabalhando na tarefa.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {newToken && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Copie agora — ele não será mostrado de novo.</p>
            <code className="block break-all font-mono text-xs">{newToken}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(newToken);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        )}
        {current ? (
          <div className="text-xs text-muted-foreground">
            Token ativo <span className="font-mono">{current.token_prefix}…</span> · criado{" "}
            {new Date(current.created_at).toLocaleDateString("pt-BR")}
            {current.last_used_at && ` · último sinal ${new Date(current.last_used_at).toLocaleString("pt-BR")}`}
          </div>
        ) : (
          !newToken && <p className="text-sm text-muted-foreground">Nenhum token ativo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
            {current ? "Gerar outro" : "Gerar token"}
          </Button>
          {current && (
            <Button size="sm" variant="ghost" onClick={() => revokeMut.mutate()} disabled={revokeMut.isPending}>
              Revogar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
