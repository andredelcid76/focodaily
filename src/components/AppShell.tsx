import { Link, useRouter, useLocation } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CalendarDays, ListTodo, LogOut, Sparkles, Users } from "lucide-react";

function Shell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const location = useLocation();

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

  const navItem = (to: "/" | "/semana" | "/papeis", label: string, Icon: typeof ListTodo) => {
    const active = location.pathname === to;
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
            {navItem("/papeis", "Papéis", Users)}
          </nav>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
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
