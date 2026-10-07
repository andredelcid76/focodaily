import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskTableView } from "./minhas-tarefas";
export const Route = createFileRoute("/delegadas")({
  head: () => ({
    meta: [
      { title: "Tarefas delegadas para mim | Foco" },
      {
        name: "description",
        content:
          "Veja as tarefas que outras pessoas atribuíram a você, aceite escolhendo a data e acompanhe o que está em andamento.",
      },
      { property: "og:title", content: "Tarefas delegadas para mim | Foco" },
      {
        property: "og:description",
        content: "Tarefas atribuídas a você por colegas, com data e prioridade em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DelegatedPage,
});

function DelegatedPage() {
  const [tab, setTab] = useState<"toMe" | "byMe">("toMe");
  return (
    <div className="space-y-2">
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <h1 className="font-display flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserCheck className="h-6 w-6" /> Delegadas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tab === "toMe"
            ? "Tarefas que outras pessoas atribuíram a você."
            : "Tarefas que você atribuiu a outras pessoas."}
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-border/60 p-0.5">
          <Button size="sm" variant={tab === "toMe" ? "secondary" : "ghost"} onClick={() => setTab("toMe")}>
            Para mim
          </Button>
          <Button size="sm" variant={tab === "byMe" ? "secondary" : "ghost"} onClick={() => setTab("byMe")}>
            Que eu deleguei
          </Button>
        </div>
      </div>
      <TaskTableView key={tab} scope={tab} hideHeader />
    </div>
  );
}
