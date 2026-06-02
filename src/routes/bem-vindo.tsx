import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Sparkles,
  ListTodo,
  FolderKanban,
  Inbox,
  Calendar,
  Plug,
  ArrowRight,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export const Route = createFileRoute("/bem-vindo")({
  component: () => (
    <AuthProvider>
      <Welcome />
    </AuthProvider>
  ),
});

const ACTIONS = [
  {
    icon: ListTodo,
    title: "Anotar uma tarefa para hoje",
    desc: "Comece pelo básico: capture o que precisa fazer agora.",
    to: "/" as const,
    primary: true,
  },
  {
    icon: FolderKanban,
    title: "Criar um projeto",
    desc: "Agrupe tarefas, prazos e equipe em um lugar.",
    to: "/projetos" as const,
  },
  {
    icon: Calendar,
    title: "Ver sua agenda",
    desc: "Encaixe tarefas entre as reuniões.",
    to: "/agenda" as const,
  },
  {
    icon: Inbox,
    title: "Abrir a caixa de entrada",
    desc: "Sugestões geradas de e-mails, reuniões e Pipedrive.",
    to: "/inbox" as const,
  },
  {
    icon: Plug,
    title: "Conectar Outlook ou Fireflies",
    desc: "Sincronize sua agenda e reuniões automaticamente.",
    to: "/configuracoes" as const,
  },
];

function Welcome() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-dvh items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="min-h-dvh bg-background flex items-start justify-center p-4 pt-12 sm:pt-20">
      <div className="w-full max-w-2xl space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-3 text-center"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-prestige shadow-glow">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </span>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Boas-vindas ao Focou</h1>
          <p className="text-muted-foreground">Por onde você quer começar?</p>
        </motion.div>

        <div className="grid gap-3 sm:grid-cols-2">
          {ACTIONS.map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className={a.primary ? "sm:col-span-2" : ""}
              >
                <Link to={a.to} className="block">
                  <Card
                    className={`group p-4 cursor-pointer transition-all hover:shadow-elegant hover:-translate-y-0.5 ${
                      a.primary ? "bg-gradient-prestige text-primary-foreground border-transparent" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          a.primary ? "bg-white/15" : "bg-primary/10 text-primary"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{a.title}</p>
                        <p className={`text-sm ${a.primary ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {a.desc}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0" />
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" asChild>
            <Link to="/">Ir direto para Hoje</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
