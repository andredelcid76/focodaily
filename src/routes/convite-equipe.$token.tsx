import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getTeamInvitePreview, acceptTeamInvite } from "@/lib/teams.functions";

export const Route = createFileRoute("/convite-equipe/$token")({
  component: ConviteEquipePage,
});

function ConviteEquipePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetchPreview = useServerFn(getTeamInvitePreview);
  const accept = useServerFn(acceptTeamInvite);

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
    queryKey: ["team-invite-preview", token],
    queryFn: () => fetchPreview({ data: { token } }),
  });

  const acceptMut = useMutation({
    mutationFn: () => accept({ data: { token } }),
    onSuccess: (res) => {
      toast.success("Você entrou na equipe!");
      navigate({ to: "/equipes/$id", params: { id: res.team_id } });
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

  if (!session.email) {
    return (
      <CenteredCard>
        <CardHeader>
          <div
            className="mb-2 h-10 w-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${preview.team_color}20`, color: preview.team_color }}
          >
            <Users className="h-5 w-5" />
          </div>
          <CardTitle>{preview.inviter_name} te convidou</CardTitle>
          <CardDescription>
            Para entrar na equipe <strong>{preview.team_name}</strong>, faça login com{" "}
            <strong>{preview.email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/auth">Entrar para aceitar</Link>
          </Button>
        </CardContent>
      </CenteredCard>
    );
  }

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
          style={{ backgroundColor: `${preview.team_color}20`, color: preview.team_color }}
        >
          <Users className="h-5 w-5" />
        </div>
        <CardTitle>{preview.inviter_name} te convidou</CardTitle>
        <CardDescription>
          Você foi convidado para a equipe <strong>{preview.team_name}</strong>. Ao entrar,
          você passa a ver todos os projetos compartilhados com ela.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending}>
          {acceptMut.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
          )}
          Aceitar e entrar na equipe
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
