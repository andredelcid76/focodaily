import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getInvitePreview, acceptProjectInvite } from "@/lib/team.functions";

export const Route = createFileRoute("/convite/$token")({
  component: ConvitePage,
});

function ConvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetchPreview = useServerFn(getInvitePreview);
  const accept = useServerFn(acceptProjectInvite);

  const [session, setSession] = useState<{ loaded: boolean; email: string | null }>({
    loaded: false,
    email: null,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSession({ loaded: true, email: data.user?.email ?? null });
    });
  }, []);

  const { data: preview, isLoading } = useQuery({
    queryKey: ["invite-preview", token],
    queryFn: () => fetchPreview({ data: { token } }),
  });

  const acceptMut = useMutation({
    mutationFn: () => accept({ data: { token } }),
    onSuccess: (res) => {
      toast.success("Você entrou no projeto!");
      navigate({ to: "/projetos/$id", params: { id: res.project_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !session.loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!preview?.valid) {
    const msg =
      preview?.reason === "expired"
        ? "Este convite expirou."
        : preview?.reason === "accepted"
        ? "Este convite já foi aceito."
        : "Convite não encontrado.";
    return (
      <CenteredCard>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Convite inválido</CardTitle>
          </div>
          <CardDescription>{msg}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/">Ir para o Foco</Link>
          </Button>
        </CardContent>
      </CenteredCard>
    );
  }

  // Not logged in → send to /auth with redirect back
  if (!session.email) {
    return (
      <CenteredCard>
        <CardHeader>
          <div
            className="mb-2 h-10 w-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${preview.project_color}20`, color: preview.project_color }}
          >
            <Users className="h-5 w-5" />
          </div>
          <CardTitle>{preview.inviter_name} te convidou</CardTitle>
          <CardDescription>
            Para entrar no projeto <strong>{preview.project_name}</strong>, faça login com{" "}
            <strong>{preview.email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild>
            <Link to="/auth">Entrar para aceitar</Link>
          </Button>
        </CardContent>
      </CenteredCard>
    );
  }

  // Logged in with wrong email
  if (session.email.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <CenteredCard>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <CardTitle>E-mail diferente</CardTitle>
          </div>
          <CardDescription>
            Este convite foi enviado para <strong>{preview.email}</strong>, mas você está logado
            como <strong>{session.email}</strong>.
            <br />
            Saia e entre com o e-mail correto para aceitar.
          </CardDescription>
        </CardHeader>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <CardHeader>
        <div
          className="mb-2 h-10 w-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${preview.project_color}20`, color: preview.project_color }}
        >
          <Users className="h-5 w-5" />
        </div>
        <CardTitle>{preview.inviter_name} te convidou</CardTitle>
        <CardDescription>
          Você foi convidado para colaborar no projeto{" "}
          <strong>{preview.project_name}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending}>
          {acceptMut.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
          )}
          Aceitar e entrar no projeto
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Agora não</Link>
        </Button>
      </CardContent>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}
