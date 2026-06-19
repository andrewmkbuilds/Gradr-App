import {
  FileText,
  Target,
  Zap,
  Mic,
  Rocket,
  LayoutDashboard,
  ChevronLeft,
  LogOut,
  Settings,
  Sparkles,
  Briefcase,
  KanbanSquare,
  Mail,
  Gift,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const engines = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Resume Intelligence", url: "/resume", icon: FileText },
  { title: "Job Feed", url: "/jobs", icon: Briefcase },
  { title: "Pipeline", url: "/pipeline", icon: KanbanSquare },
  { title: "AI Match", url: "/match", icon: Target },
  { title: "Application Engine", url: "/apply", icon: Zap },
  { title: "Interview Coach", url: "/interview", icon: Mic },
  { title: "Growth & Proof", url: "/growth", icon: Rocket },
  { title: "Pricing", url: "/pricing", icon: Sparkles },
  { title: "Affiliate", url: "/affiliate", icon: Gift },
  { title: "Digest Preview", url: "/admin/digest-preview", icon: Mail },
  { title: "Affiliate Admin", url: "/admin/affiliates", icon: Sparkles },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          {!collapsed && (
            <div className="flex items-center gap-2 animate-slide-up">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground tracking-tight">CareerFlow OS</div>
                <p className="text-[10px] text-muted-foreground">AI Career System</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center mx-auto">
              <Zap className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {engines.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        aria-label={item.title}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                        activeClassName="bg-primary/10 text-primary"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-1">
        <button
          onClick={signOut}
          aria-label="Sign Out"
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors text-sm"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
