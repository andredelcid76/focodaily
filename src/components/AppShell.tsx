import { useRouter, useLocation, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ActiveTaskBanner } from "@/components/ActiveTaskBanner";
import { GlobalSearch, useGlobalSearchHotkey } from "@/components/GlobalSearch";
import { AppSidebar } from "@/components/AppSidebar";
import { MayaChat } from "@/components/MayaChat";
import { QuickAddTaskButton } from "@/components/QuickAddTaskButton";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Search, Sparkles } from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";

const PAGE_META: { match: (path: string) => boolean; eyebrow: string; eyebrowHref: string; title: string }[] = [
  { match: (p) => p === "/", eyebrow: "Planejar", eyebrowHref: "/", title: "Hoje" },
  { match: (p) => p.startsWith("/semana"), eyebrow: "Planejar", eyebrowHref: "/", title: "Semana" },
  { match: (p) => p.startsWith("/agenda"), eyebrow: "Planejar", eyebrowHref: "/", title: "Agenda" },
  { match: (p) => p.startsWith("/minhas-tarefas"), eyebrow: "Planejar", eyebrowHref: "/", title: "Tarefas" },
  { match: (p) => p.startsWith("/projetos"), eyebrow: "Trabalho", eyebrowHref: "/projetos", title: "Projetos" },
  { match: (p) => p.startsWith("/equipes"), eyebrow: "Trabalho", eyebrowHref: "/projetos", title: "Equipes" },
  { match: (p) => p.startsWith("/papeis"), eyebrow: "Trabalho", eyebrowHref: "/projetos", title: "Papéis" },
  { match: (p) => p.startsWith("/inbox"), eyebrow: "Trabalho", eyebrowHref: "/projetos", title: "Caixa de entrada" },
  { match: (p) => p.startsWith("/analise"), eyebrow: "Insights", eyebrowHref: "/analise", title: "Análise estratégica" },
  { match: (p) => p.startsWith("/configuracoes"), eyebrow: "Sistema", eyebrowHref: "/configuracoes", title: "Configurações" },
];

function pageMetaFor(pathname: string) {
  return PAGE_META.find((m) => m.match(pathname)) ?? { eyebrow: "Foco", eyebrowHref: "/", title: "" };
}

function Shell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  useGlobalSearchHotkey(searchOpen, setSearchOpen);

  const meta = useMemo(() => pageMetaFor(location.pathname), [location.pathname]);

  useEffect(() => {
    if (!loading && !user && location.pathname !== "/auth") {
      router.navigate({ to: "/auth" });
    }
  }, [loading, user, location.pathname, router]);

  // Onboarding redirect: if signed-in user hasn't completed onboarding, send them there.
  useEffect(() => {
    if (!user) return;
    if (location.pathname === "/onboarding" || location.pathname === "/auth") return;
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data && !data.onboarded_at) {
        router.navigate({ to: "/onboarding" });
      }
    })();
    return () => { cancelled = true; };
  }, [user, location.pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-prestige shadow-glow">
            <span className="absolute inset-0 animate-ping rounded-xl bg-primary/30" />
            <Sparkles className="relative h-4 w-4 text-primary-foreground" />
          </span>
          <span className="text-sm">Carregando…</span>
        </div>
      </div>
    );
  }

  if (!user) return <>{children}</>;

  return (
    <SidebarProvider>
      <div className="min-h-dvh flex w-full">
        <AppSidebar onOpenSearch={() => setSearchOpen(true)} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/40 glass-strong px-3 sm:px-4">
            <SidebarTrigger className="shrink-0" />

            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <Link
                to={meta.eyebrowHref}
                className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
              >
                {meta.eyebrow}
              </Link>
              {meta.title && (
                <>
                  <span className="text-muted-foreground/40">/</span>
                  <span className="font-display text-sm font-semibold tracking-tight truncate">
                    {meta.title}
                  </span>
                </>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setSearchOpen(true)}
                className="group hidden sm:inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-background/70 hover:text-foreground"
                aria-label="Buscar"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Buscar tarefas, projetos…</span>
                <kbd className="ml-2 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] tracking-wider">
                  ⌘K
                </kbd>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden h-9 w-9"
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar"
              >
                <Search className="h-4 w-4" />
              </Button>
              <NotificationsBell />
            </div>
          </header>

          <ActiveTaskBanner />

          <main className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 sm:py-8"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
        <MayaChat />
        <QuickAddTaskButton />
      </div>
    </SidebarProvider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
