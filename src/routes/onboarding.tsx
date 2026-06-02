import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, ArrowRight, FolderKanban, ListTodo, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { getMyProfile, completeOnboarding } from "@/lib/profile.functions";

export const Route = createFileRoute("/onboarding")({
  component: () => (
    <AuthProvider>
      <OnboardingPage />
    </AuthProvider>
  ),
});

function OnboardingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const complete = useServerFn(completeOnboarding);

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [tasks, setTasks] = useState<string[]>([""]);

  const { data: profileData } = useQuery({
    queryKey: ["onboarding-profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profileData?.profile) {
      setDisplayName(profileData.profile.display_name ?? "");
      if (profileData.profile.onboarded_at) navigate({ to: "/" });
    }
  }, [profileData, navigate]);

  const finishMut = useMutation({
    mutationFn: () =>
      complete({
        data: {
          display_name: displayName.trim() || undefined,
          project_name: projectName.trim() || undefined,
          first_tasks: tasks.map((t) => t.trim()).filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Tudo pronto!");
      navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const skip = useMutation({
    mutationFn: () => complete({ data: {} }),
    onSuccess: () => navigate({ to: "/" }),
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">Carregando…</div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-prestige shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Bem-vindo</p>
            <h1 className="font-display text-xl font-semibold">Vamos configurar o Foco em 1 minuto</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-medium">Como devemos te chamar?</h2>
              <p className="text-sm text-muted-foreground">Você pode mudar depois nas configurações da conta.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dn">Seu nome</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu nome" autoFocus />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => skip.mutate()} disabled={skip.isPending}>Pular tudo</Button>
              <Button onClick={() => setStep(1)}>Continuar <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <FolderKanban className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h2 className="font-medium">Crie seu primeiro projeto</h2>
                <p className="text-sm text-muted-foreground">Projetos agrupam tarefas, briefings, prazos e a equipe envolvida. Opcional.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pn">Nome do projeto</Label>
              <Input id="pn" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex.: Lançamento Q3" />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>Voltar</Button>
              <Button onClick={() => setStep(2)}>Continuar <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <ListTodo className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h2 className="font-medium">Suas tarefas de hoje</h2>
                <p className="text-sm text-muted-foreground">Adicione até 3 coisas que você quer fazer hoje. Serão criadas em "Hoje"{projectName ? ` no projeto "${projectName}"` : ""}.</p>
              </div>
            </div>
            <div className="space-y-2">
              {tasks.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={t} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Tarefa ${i + 1}`} />
                  {tasks.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {tasks.length < 5 && (
                <Button variant="ghost" size="sm" onClick={() => setTasks([...tasks, ""])}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar tarefa
                </Button>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={() => finishMut.mutate()} disabled={finishMut.isPending}>
                {finishMut.isPending ? "Finalizando…" : "Finalizar"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
