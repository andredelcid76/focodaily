import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, FolderKanban, ListTodo, Plus, X, SkipForward } from "lucide-react";
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

const STEPS = ["Você", "Projeto (opcional)", "Primeiras tarefas (opcional)"];

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
      if (profileData.profile.onboarded_at) navigate({ to: "/bem-vindo" });
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
      navigate({ to: "/bem-vindo" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const skipAll = useMutation({
    mutationFn: () =>
      complete({ data: { display_name: displayName.trim() || undefined } }),
    onSuccess: () => navigate({ to: "/bem-vindo" }),
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">Carregando…</div>
    );
  }

  const slideVariants = {
    enter: { opacity: 0, x: 24 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-xl p-6 sm:p-8 space-y-6 shadow-elegant">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-prestige shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Bem-vindo</p>
            <h1 className="font-display text-xl font-semibold">Em menos de 1 minuto você está dentro</h1>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {STEPS.map((_, i) => (
              <motion.span
                key={i}
                animate={{ backgroundColor: i <= step ? "hsl(var(--primary))" : "hsl(var(--muted))" }}
                transition={{ duration: 0.3 }}
                className="h-1.5 flex-1 rounded-full"
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Passo {step + 1} de {STEPS.length} · {STEPS[step]}</p>
        </div>

        <div className="relative min-h-[240px]">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="s0"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                <div>
                  <h2 className="font-medium">Como devemos te chamar?</h2>
                  <p className="text-sm text-muted-foreground">Você pode mudar depois nas configurações da conta.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dn">Seu nome</Label>
                  <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu nome" autoFocus />
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => skipAll.mutate()} disabled={skipAll.isPending}>
                    <SkipForward className="mr-1.5 h-4 w-4" /> Pular tudo
                  </Button>
                  <Button onClick={() => setStep(1)}>Continuar <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="s1"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                <div className="flex items-start gap-3">
                  <FolderKanban className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h2 className="font-medium">Quer criar um primeiro projeto?</h2>
                    <p className="text-sm text-muted-foreground">
                      Projetos agrupam tarefas, briefings, prazos e a equipe envolvida.
                      <span className="text-foreground/80"> Totalmente opcional</span> — você pode criar depois.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pn">Nome do projeto</Label>
                  <Input id="pn" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex.: Lançamento Q3" />
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(0)}>Voltar</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setProjectName(""); setStep(2); }}>
                      Pular
                    </Button>
                    <Button onClick={() => setStep(2)}>Continuar <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="s2"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                <div className="flex items-start gap-3">
                  <ListTodo className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h2 className="font-medium">O que você quer fazer hoje?</h2>
                    <p className="text-sm text-muted-foreground">
                      Adicione até 3 tarefas{projectName ? ` no projeto "${projectName}"` : ""}. Também opcional.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {tasks.map((t, i) => (
                      <motion.div
                        key={i}
                        layout
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="flex gap-2"
                      >
                        <Input
                          value={t}
                          onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? e.target.value : x)))}
                          placeholder={`Tarefa ${i + 1}`}
                        />
                        {tasks.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {tasks.length < 5 && (
                    <Button variant="ghost" size="sm" onClick={() => setTasks([...tasks, ""])}>
                      <Plus className="h-4 w-4 mr-1" /> Adicionar tarefa
                    </Button>
                  )}
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
                  <Button onClick={() => finishMut.mutate()} disabled={finishMut.isPending}>
                    {finishMut.isPending ? "Finalizando…" : "Finalizar"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}
