import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CHANGELOG } from "@/lib/changelog";

export const Route = createFileRoute("/novidades")({
  head: () => ({
    meta: [
      { title: "Novidades | Foco" },
      { name: "description", content: "Histórico de melhorias e novidades de cada versão do Foco." },
      { property: "og:title", content: "Novidades | Foco" },
      { property: "og:description", content: "O que mudou em cada versão do Foco." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangelogPage,
});

function fmt(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function ChangelogPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" /> Novidades
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">O que mudou em cada versão do Foco.</p>
      </div>
      {CHANGELOG.map((e) => (
        <Card key={e.id} className="p-5 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{fmt(e.date)}</div>
            <h2 className="font-display text-lg font-semibold">{e.title}</h2>
          </div>
          <ul className="space-y-2 text-sm">
            {e.items.map((it) => (
              <li key={it} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
