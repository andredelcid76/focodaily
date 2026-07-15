import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useTasks } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useRoles } from "@/hooks/useRoles";
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Layers,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/analise")({
  component: () => (
    <AppShell>
      <AnalisePage />
    </AppShell>
  ),
});

type Period = "today" | "yesterday" | "7d" | "30d" | "90d" | "all";

const PERIOD_LABEL: Record<Period, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  all: "Tudo",
};

const periodDays = (p: Period): number => {
  switch (p) {
    case "today": return 1;
    case "yesterday": return 1;
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "all": return 60;
  }
};

function AnalisePage() {
  const { user } = useAuth();
  if (!user) return null;
  return <AnaliseInner userId={user.id} />;
}

function AnaliseInner({ userId }: { userId: string }) {
  const { tasks } = useTasks(userId);
  const { projects } = useProjects(userId);
  const { roles } = useRoles(userId);
  const [period, setPeriod] = useState<Period>("30d");

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const { cutoff, upper } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (period === "all") return { cutoff: null as Date | null, upper: null as Date | null };
    if (period === "today") {
      const end = new Date(today); end.setDate(end.getDate() + 1);
      return { cutoff: today, upper: end };
    }
    if (period === "yesterday") {
      const start = new Date(today); start.setDate(start.getDate() - 1);
      return { cutoff: start, upper: today };
    }
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const d = new Date(today); d.setDate(d.getDate() - days + 1);
    return { cutoff: d, upper: null };
  }, [period]);

  const inRange = (iso?: string | null) => {
    if (!iso) return false;
    if (!cutoff) return true;
    const d = new Date(iso);
    if (d < cutoff) return false;
    if (upper && d >= upper) return false;
    return true;
  };

  const scoped = useMemo(() => {
    return tasks.filter((t) => {
      if (t.user_id !== userId && t.assignee_id !== userId) return false;
      if (!cutoff) return true;
      return (
        inRange(t.scheduled_date) ||
        inRange(t.planned_date) ||
        inRange(t.completed_at) ||
        inRange(t.created_at)
      );
    });
  }, [tasks, userId, cutoff, upper]);

  // KPIs
  const kpis = useMemo(() => {
    const total = scoped.length;
    const done = scoped.filter((t) => t.completed).length;
    const overdue = scoped.filter(
      (t) => !t.completed && t.scheduled_date && new Date(t.scheduled_date) < new Date(new Date().toDateString()),
    ).length;
    const postponed = scoped.filter((t) => (t.postpone_count ?? 0) > 0).length;
    const critical = scoped.filter((t) => (t.postpone_count ?? 0) >= 3).length;
    const totalPostpones = scoped.reduce((s, t) => s + (t.postpone_count ?? 0), 0);
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const avgPostpone = total > 0 ? (totalPostpones / total).toFixed(1) : "0";
    return { total, done, overdue, postponed, critical, completionRate, avgPostpone, totalPostpones };
  }, [scoped]);

  // Evolução diária (concluídas, criadas e adiadas por dia)
  // Para 'today' e 'yesterday' mostramos 14 dias de contexto para a evolução.
  const daily = useMemo(() => {
    const windowDays =
      period === "today" || period === "yesterday" ? 14 : periodDays(period);
    const map = new Map<
      string,
      { date: string; concluidas: number; criadas: number; adiadas: number }
    >();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      map.set(iso, { date: iso.slice(5), concluidas: 0, criadas: 0, adiadas: 0 });
    }
    // Usa todas as tarefas do usuário para a evolução, não apenas o recorte do período.
    const userTasks = tasks.filter(
      (t) => t.user_id === userId || t.assignee_id === userId,
    );
    for (const t of userTasks) {
      if (t.completed_at) {
        const iso = t.completed_at.slice(0, 10);
        const entry = map.get(iso);
        if (entry) entry.concluidas += 1;
      }
      if (t.created_at) {
        const iso = t.created_at.slice(0, 10);
        const entry = map.get(iso);
        if (entry) entry.criadas += 1;
      }
      // Adiada nesse dia: estava planejada para o dia mas foi remarcada para depois
      if (
        t.planned_date &&
        t.scheduled_date &&
        t.scheduled_date > t.planned_date &&
        (t.postpone_count ?? 0) > 0
      ) {
        const entry = map.get(t.planned_date);
        if (entry) entry.adiadas += 1;
      }
    }
    return Array.from(map.values());
  }, [tasks, userId, period]);

  // Snapshot diário recente (últimos 7 dias) para a "evolução"
  const snapshot = useMemo(() => {
    return daily.slice(-7);
  }, [daily]);

  // Por papel
  const byRole = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number; concluidas: number; adiadas: number }>();
    map.set("sem", { name: "Sem papel", color: "#64748b", total: 0, concluidas: 0, adiadas: 0 });
    for (const t of scoped) {
      const r = t.role_id ? rolesById.get(t.role_id) : null;
      const key = r?.id ?? "sem";
      const entry = map.get(key) ?? { name: r?.name ?? "Sem papel", color: r?.color ?? "#64748b", total: 0, concluidas: 0, adiadas: 0 };
      entry.total += 1;
      if (t.completed) entry.concluidas += 1;
      if ((t.postpone_count ?? 0) > 0) entry.adiadas += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  }, [scoped, rolesById]);

  // Por projeto
  const byProject = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number; concluidas: number; adiadas: number; criticas: number }>();
    for (const t of scoped) {
      if (!t.project_id) continue;
      const p = projectsById.get(t.project_id);
      if (!p) continue;
      const entry = map.get(p.id) ?? { name: p.name, color: p.color, total: 0, concluidas: 0, adiadas: 0, criticas: 0 };
      entry.total += 1;
      if (t.completed) entry.concluidas += 1;
      if ((t.postpone_count ?? 0) > 0) entry.adiadas += 1;
      if ((t.postpone_count ?? 0) >= 3) entry.criticas += 1;
      map.set(p.id, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [scoped, projectsById]);

  // Top procrastinadas
  const topPostponed = useMemo(() => {
    return [...scoped]
      .filter((t) => (t.postpone_count ?? 0) > 0)
      .sort((a, b) => (b.postpone_count ?? 0) - (a.postpone_count ?? 0))
      .slice(0, 8);
  }, [scoped]);

  // Distribuição por categoria
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of scoped) {
      map.set(t.category, (map.get(t.category) ?? 0) + 1);
    }
    const colors: Record<string, string> = {
      important: "#6b8afd",
      circumstantial: "#e8c468",
      personal: "#60a5fa",
      delegated: "#a78bfa",
    };
    const labels: Record<string, string> = {
      important: "Importantes",
      circumstantial: "Circunstanciais",
      personal: "Pessoais",
      delegated: "Delegadas",
    };
    return Array.from(map.entries()).map(([k, v]) => ({
      name: labels[k] ?? k,
      value: v,
      color: colors[k] ?? "#94a3b8",
    }));
  }, [scoped]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Insights</p>
          <h1 className="font-display text-3xl font-bold">
            <BarChart3 className="inline h-7 w-7 text-primary mr-2 -mt-1" />
            Análise estratégica
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Desempenho geral, atividade por papel, projetos e adiamentos críticos.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
          {(["today", "yesterday", "7d", "30d", "90d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                period === p ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Layers className="h-4 w-4" />} label="Tarefas no período" value={kpis.total} sub={`${kpis.done} concluídas`} />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Taxa de conclusão"
          value={`${kpis.completionRate}%`}
          tone={kpis.completionRate >= 70 ? "good" : kpis.completionRate >= 40 ? "warn" : "bad"}
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Adiadas"
          value={kpis.postponed}
          sub={`Média ${kpis.avgPostpone} por tarefa`}
          tone={kpis.postponed > kpis.total / 3 ? "warn" : "neutral"}
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Adiamentos críticos"
          value={kpis.critical}
          sub="3+ adiamentos"
          tone={kpis.critical > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Atividade diária" icon={<TrendingUp className="h-4 w-4" />} className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="concluidas" stroke="#6b8afd" strokeWidth={2} dot={false} name="Concluídas" />
                <Line type="monotone" dataKey="criadas" stroke="#e8c468" strokeWidth={2} dot={false} name="Criadas" />
                <Line type="monotone" dataKey="adiadas" stroke="#f87171" strokeWidth={2} dot={false} name="Adiadas" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Por categoria" icon={<Layers className="h-4 w-4" />}>
          <div className="h-64">
            {byCategory.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {byCategory.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card title="Evolução diária — últimos 7 dias" icon={<TrendingUp className="h-4 w-4" />}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={snapshot}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="concluidas" fill="#6b8afd" name="Concluídas" radius={[4, 4, 0, 0]} />
              <Bar dataKey="adiadas" fill="#f87171" name="Adiadas" radius={[4, 4, 0, 0]} />
              <Bar dataKey="criadas" fill="#e8c468" name="Criadas" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Snapshot independente do filtro acima — mostra sempre os últimos 7 dias para acompanhar a evolução.
        </p>
      </Card>



      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Desempenho por papel" icon={<BarChart3 className="h-4 w-4" />}>
          {byRole.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byRole} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="concluidas" fill="#6b8afd" name="Concluídas" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="adiadas" fill="#e8c468" name="Adiadas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Top projetos por volume" icon={<Layers className="h-4 w-4" />}>
          {byProject.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {byProject.map((p) => {
                const pct = p.total > 0 ? Math.round((p.concluidas / p.total) * 100) : 0;
                return (
                  <div key={p.name} className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="truncate text-sm font-medium">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                        <span>{p.concluidas}/{p.total}</span>
                        <span className={pct >= 70 ? "text-primary" : pct >= 40 ? "text-amber-500" : "text-rose-500"}>
                          {pct}%
                        </span>
                        {p.criticas > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-500">
                            <AlertTriangle className="h-3 w-3" /> {p.criticas}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title="Tarefas mais procrastinadas" icon={<AlertTriangle className="h-4 w-4" />}>
        {topPostponed.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum adiamento no período. Excelente disciplina! 🎯
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {topPostponed.map((t) => {
              const project = t.project_id ? projectsById.get(t.project_id) : null;
              const role = t.role_id ? rolesById.get(t.role_id) : null;
              const count = t.postpone_count ?? 0;
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${t.completed ? "line-through text-muted-foreground" : ""}`}>
                      {t.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {project && (
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                          {project.name}
                        </span>
                      )}
                      {role && <span style={{ color: role.color }}>{role.name}</span>}
                      <span>· prevista para {t.scheduled_date}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      count >= 3
                        ? "bg-rose-500/10 text-rose-500 border border-rose-500/40"
                        : "bg-amber-500/10 text-amber-500 border border-amber-500/40"
                    }`}
                  >
                    {count}× adiada
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good" ? "text-primary" :
    tone === "warn" ? "text-amber-500" :
    tone === "bad" ? "text-rose-500" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-2 font-display text-3xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Card({ title, icon, children, className = "" }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm shadow-[var(--shadow-card)] ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center py-8 text-sm text-muted-foreground">
      Sem dados no período.
    </div>
  );
}
