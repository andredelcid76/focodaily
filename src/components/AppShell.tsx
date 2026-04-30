import { useRouter, useLocation } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ActiveTaskBanner } from "@/components/ActiveTaskBanner";
import { GlobalSearch, useGlobalSearchHotkey } from "@/components/GlobalSearch";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

function Shell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar onOpenSearch={() => setSearchOpen(true)} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border/60 bg-background/70 px-3 backdrop-blur-xl">
            <SidebarTrigger />
          </header>
          <ActiveTaskBanner />
          <main className="flex-1">
            <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
          </main>
        </div>

        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
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
