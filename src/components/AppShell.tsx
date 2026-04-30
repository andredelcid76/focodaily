import { Link, useRouter, useLocation } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CalendarClock, CalendarDays, FolderKanban, ListTodo, LogOut, Search, Sparkles, Users } from "lucide-react";
import { ActiveTaskBanner } from "@/components/ActiveTaskBanner";
import { MayaChat } from "@/components/MayaChat";
import { GlobalSearch, useGlobalSearchHotkey } from "@/components/GlobalSearch";

function Shell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  useGlobalSearchHotkey(searchOpen, setSearchOpen);

  useEffect(() => {
    if (!loading && !user && location.pathname !== "/auth") {
      router.navigate({ to: "/auth" });
    }
  }, [loading, user, location.pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!user) return <>{children}</>;

  const navItem = (
    to: "/" | "/semana" | "/agenda" | "/papeis" | "/projetos",
    label: string,
    Icon: typeof ListTodo
  ) => {
    const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-circumstantial shadow-[var(--shadow-glow)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">Foco</span>
          </Link>
          <nav className="flex items-center gap-1">
            {navItem("/", "Hoje", ListTodo)}
            {navItem("/semana", "Semana", CalendarDays)}
            {navItem("/agenda", "Agenda", CalendarClock)}
            {navItem("/projetos", "Projetos", FolderKanban)}
            {navItem("/papeis", "Papéis", Users)}
          </nav>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              aria-label="Buscar (Ctrl+K)"
              title="Buscar (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Buscar</span>
              <kbd className="hidden md:inline rounded bg-muted/60 px-1 py-0.5 text-[10px] font-mono">⌘K</kbd>
            </button>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <ActiveTaskBanner />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <MayaChat />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
