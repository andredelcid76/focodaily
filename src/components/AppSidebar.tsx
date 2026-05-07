import { Link, useLocation } from "@tanstack/react-router";
import { CalendarClock, CalendarDays, FolderKanban, Inbox, ListTodo, LogOut, Search, Sparkles, Users } from "lucide-react";
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

const items = [
  { title: "Hoje", url: "/", icon: ListTodo },
  { title: "Caixa de entrada", url: "/inbox", icon: Inbox },
  { title: "Semana", url: "/semana", icon: CalendarDays },
  { title: "Agenda", url: "/agenda", icon: CalendarClock },
  { title: "Projetos", url: "/projetos", icon: FolderKanban },
  { title: "Papéis", url: "/papeis", icon: Users },
] as const;

export function AppSidebar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();

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
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
