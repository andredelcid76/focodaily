import { Link, useLocation } from "@tanstack/react-router";
import { CalendarClock, CalendarDays, FolderKanban, Inbox, ListTodo, LogOut, Search, Sparkles, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { title: "Hoje", url: "/", icon: ListTodo },
  { title: "Caixa de entrada", url: "/inbox", icon: Inbox, badgeKey: "inbox" as const },
  { title: "Semana", url: "/semana", icon: CalendarDays },
  { title: "Agenda", url: "/agenda", icon: CalendarClock },
  { title: "Projetos", url: "/projetos", icon: FolderKanban },
  { title: "Papéis", url: "/papeis", icon: Users },
] as const;

function useInboxCount(userId: string | undefined) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      const { count: c } = await supabase
        .from("inbox_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending");
      if (active) setCount(c ?? 0);
    };
    load();
    const channel = supabase
      .channel("inbox-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "inbox_suggestions", filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    const interval = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [userId]);
  return count;
}

export function AppSidebar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, user } = useAuth();
  const inboxCount = useInboxCount(user?.id);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border/60">
        <Link to="/" className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-circumstantial shadow-[var(--shadow-glow)]">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-display text-lg font-semibold tracking-tight">Foco</span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const showBadge = "badgeKey" in item && item.badgeKey === "inbox" && inboxCount > 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
                      <Link to={item.url} className="flex items-center gap-2">
                        <span className="relative shrink-0">
                          <item.icon className="h-4 w-4" />
                          {showBadge && collapsed && (
                            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                          )}
                        </span>
                        <span className="flex-1">{item.title}</span>
                        {showBadge && !collapsed && (
                          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                            {inboxCount > 99 ? "99+" : inboxCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onOpenSearch} tooltip="Buscar (⌘K)">
                  <Search className="h-4 w-4 shrink-0" />
                  <span>Buscar</span>
                  {!collapsed && (
                    <kbd className="ml-auto rounded bg-muted/60 px-1 py-0.5 text-[10px] font-mono">
                      ⌘K
                    </kbd>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sair">
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
