import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ShieldCheck, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthProvider, useAuth } from "@/lib/auth";
import { issueOAuthAuthorizationCode, getOAuthClient } from "@/lib/oauth.functions";

type Search = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  state?: string;
};

export const Route = createFileRoute("/oauth/consent")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    client_id: String(s.client_id ?? ""),
    redirect_uri: String(s.redirect_uri ?? ""),
    code_challenge: String(s.code_challenge ?? ""),
    code_challenge_method: String(s.code_challenge_method ?? "S256"),
    scope: s.scope ? String(s.scope) : undefined,
    state: s.state ? String(s.state) : undefined,
  }),
  component: ConsentPage,
});

function ConsentPage() {
  const search = useSearch({ from: "/oauth/consent" });
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [denied, setDenied] = useState(false);

  const getClient = useServerFn(getOAuthClient);
  const issue = useServerFn(issueOAuthAuthorizationCode);

  useEffect(() => {
    if (!loading && !user) {
      const next = `/oauth/consent?${new URLSearchParams(search as Record<string, string>).toString()}`;
      navigate({ to: "/auth", search: { next } as never });
    }
  }, [loading, user, navigate, search]);

  const clientQ = useQuery({
    queryKey: ["oauth-client", search.client_id],
    queryFn: () => getClient({ data: { clientId: search.client_id } }),
    enabled: !!user && !!search.client_id,
  });

  const approve = useMutation({
    mutationFn: () =>
      issue({
        data: {
          clientId: search.client_id,
          redirectUri: search.redirect_uri,
          codeChallenge: search.code_challenge,
          codeChallengeMethod: "S256",
          scope: search.scope ?? "mcp",
        },
      }),
    onSuccess: ({ code }) => {
      const url = new URL(search.redirect_uri);
      url.searchParams.set("code", code);
      if (search.state) url.searchParams.set("state", search.state);
      window.location.replace(url.toString());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deny = () => {
    setDenied(true);
    const url = new URL(search.redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (search.state) url.searchParams.set("state", search.state);
    window.location.replace(url.toString());
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  const clientName = clientQ.data?.name ?? "Aplicativo externo";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>Autorizar acesso</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{clientName}</span> quer acessar sua conta
            do Foco em nome de <span className="font-medium text-foreground">{user.email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <KeyRound className="h-4 w-4" /> Permissões solicitadas
            </div>
            <ul className="ml-5 list-disc text-muted-foreground">
              <li>Ler e criar tarefas, projetos e reuniões</li>
              <li>Usar ferramentas MCP do Foco</li>
            </ul>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={deny} disabled={denied || approve.isPending}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={() => approve.mutate()} disabled={approve.isPending || denied}>
              {approve.isPending ? "Autorizando…" : "Autorizar"}
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Você pode revogar o acesso a qualquer momento em Configurações.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
