import { Link, useLocation } from "@tanstack/react-router";
import {
  FolderKanban,
  Inbox,
  ListTodo,
  LogOut,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useProfiles, profileInitials } from "@/hooks/useProfiles";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type NavItem = {
  title: string;
  url: string;
  icon: typeof ListTodo;
  shortcut?: string;
  badgeKey?: "inbox";
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Planejar",
    items: [
      { title: "Hoje", url: "/", icon: ListTodo, shortcut: "G H" },
      { title: "Minhas tarefas", url: "/minhas-tarefas", icon: ListTodo, shortcut: "G M" },
    ],
  },
  {
    label: "Trabalho",
    items: [
      { title: "Projetos", url: "/projetos", icon: FolderKanban, shortcut: "G P" },
      { title: "Equipes", url: "/equipes", icon: Users, shortcut: "G E" },
      { title: "Caixa de entrada", url: "/inbox", icon: Inbox, badgeKey: "inbox", shortcut: "G I" },
    ],
  },
  {
    label: "Sistema",
    items: [{ title: "Configurações", url: "/configuracoes", icon: Settings }],
  },
];

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_suggestions", filter: `user_id=eq.${userId}` },
        load,
      )
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

// Global "g + key" hotkeys for keyboard-driven nav.
function useNavHotkeys() {
  useEffect(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const map: Record<string, string> = {
      h: "/",
      m: "/minhas-tarefas",
      p: "/projetos",
      e: "/equipes",
      i: "/inbox",
      c: "/configuracoes",
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "g" || e.key === "G") {
        armed = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => (armed = false), 900);
        return;
      }
      if (armed) {
        const dest = map[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          window.location.assign(dest);
        }
        armed = false;
        if (timer) clearTimeout(timer);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function AppSidebar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, user } = useAuth();
  const inboxCount = useInboxCount(user?.id);
  useNavHotkeys();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const initials = (user?.email ?? "?")
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-2">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-prestige shadow-glow">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-circumstantial ring-2 ring-sidebar" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-lg font-semibold tracking-tight">Foco</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Daily
              </span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && (
              <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const showBadge = item.badgeKey === "inbox" && inboxCount > 0;
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link to={item.url} className="group/nav relative flex items-center gap-2.5">
                          {active && (
                            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-circumstantial" />
                          )}
                          <span className="relative shrink-0">
                            <item.icon className={`h-4 w-4 transition-colors ${active ? "text-primary" : ""}`} />
                            {showBadge && collapsed && (
                              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-circumstantial ring-2 ring-sidebar" />
                            )}
                          </span>
                          <span className="flex-1 truncate">{item.title}</span>
                          {showBadge && !collapsed && (
                            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-circumstantial px-1.5 text-[10px] font-semibold text-circumstantial-foreground">
                              {inboxCount > 99 ? "99+" : inboxCount}
                            </span>
                          )}
                          {!showBadge && item.shortcut && !collapsed && (
                            <kbd className="ml-auto hidden rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70 group-hover/nav:inline-flex">
                              {item.shortcut}
                            </kbd>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onOpenSearch} tooltip="Buscar (⌘K)">
                  <Search className="h-4 w-4 shrink-0" />
                  <span>Buscar</span>
                  {!collapsed && (
                    <kbd className="ml-auto rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      ⌘K
                    </kbd>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <div
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-prestige text-[11px] font-semibold text-primary-foreground shadow-card">
                {initials}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{user?.email?.split("@")[0]}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {user?.email?.split("@")[1] ?? ""}
                  </p>
                </div>
              )}
            </div>
          </SidebarMenuItem>
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
