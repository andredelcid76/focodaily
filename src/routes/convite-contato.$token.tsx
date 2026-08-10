import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getContactInvitePreview, acceptContactInvite } from "@/lib/teams.functions";

export const Route = createFileRoute("/convite-contato/$token")({
  head: () => ({
    meta: [
      { title: "Convite de colaboração — Focou" },
      {
        name: "description",
        content: "Aceite o convite para colaborar no Focou e participar de projetos e equipes.",
      },
      { property: "og:title", content: "Convite de colaboração — Focou" },
      {
        property: "og:description",
        content: "Aceite o convite para colaborar no Focou.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConviteContatoPage,
});

function ConviteContatoPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetchPreview = useServerFn(getContactInvitePreview);
  const accept = useServerFn(acceptContactInvite);

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
    queryKey: ["contact-invite-preview", token],
    queryFn: () => fetchPreview({ data: { token } }),
  });

  const acceptMut = useMutation({
    mutationFn: () => accept({ data: { token } }),
    onSuccess: () => {
      toast.success("Convite aceito! Vocês já podem colaborar.");
      navigate({ to: "/equipes" });
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
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserPlus className="h-5 w-5" />
          </div>
          <CardTitle>{preview.inviter_name} quer colaborar com você</CardTitle>
          <CardDescription>
            Para aceitar, entre com <strong>{preview.email}</strong>.
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
            como <strong>{session.email}</strong>. Saia e entre com o e-mail correto para aceitar.
          </CardDescription>
        </CardHeader>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserPlus className="h-5 w-5" />
        </div>
        <CardTitle>{preview.inviter_name} quer colaborar com você</CardTitle>
        <CardDescription>
          Ao aceitar, vocês aparecem na lista de pessoas um do outro e podem ser adicionados a
          projetos individuais ou equipes — sem obrigação de entrar em nenhuma equipe.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending}>
          {acceptMut.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
          )}
          Aceitar convite
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
