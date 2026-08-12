import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Target,
  KanbanSquare,
  Zap,
  Mic,
  History,
  Rocket,
  TrendingUp,
  Sparkles,
  BookOpen,
  CreditCard,
  Settings,
  User,
  Gift,
  Mail,
  ScrollText,
  Search,
  ShieldCheck,
  BarChart3,
  Wallet,
  Activity,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /** match nested routes as active */
  matchPrefix?: boolean;
};

export type NavGroup = {
  id: string;
  title: string;
  icon: LucideIcon;
  /** where clicking the group header itself goes (also used in collapsed rail) */
  url: string;
  items: NavItem[];
  adminOnly?: boolean;
};

/** Single top-level link (no children) */
export const dashboardItem: NavItem = {
  title: "Dashboard",
  url: "/",
  icon: LayoutDashboard,
};

export const navGroups: NavGroup[] = [
  {
    id: "career",
    title: "Career",
    icon: Briefcase,
    url: "/resume",
    items: [
      { title: "Resume Intelligence", url: "/resume", icon: FileText },
      { title: "Job Feed", url: "/jobs", icon: Briefcase },
      { title: "AI Match", url: "/match", icon: Target },
      { title: "Pipeline", url: "/pipeline", icon: KanbanSquare },
      { title: "Application Engine", url: "/apply", icon: Zap },
    ],
  },
  {
    id: "interview",
    title: "Interview",
    icon: Mic,
    url: "/interview",
    items: [
      { title: "Interview Coach", url: "/interview", icon: Mic },
      { title: "History & Reports", url: "/interview/history", icon: History, matchPrefix: true },
    ],
  },
  {
    id: "growth",
    title: "Growth",
    icon: Rocket,
    url: "/growth",
    items: [
      { title: "Growth & Proof", url: "/growth", icon: Rocket },
      { title: "Skill gaps", url: "/growth#skill-gaps", icon: TrendingUp },
      { title: "Proof tools", url: "/growth#proof", icon: Sparkles },
      { title: "Career strategy", url: "/career-advice", icon: BookOpen, matchPrefix: true },
    ],
  },
  {
    id: "account",
    title: "Account",
    icon: User,
    url: "/settings",
    items: [
      { title: "Profile & Settings", url: "/settings", icon: Settings },
      { title: "Billing & Subscription", url: "/billing", icon: CreditCard },
      { title: "Pricing & Plans", url: "/pricing", icon: Sparkles },
    ],
  },
  {
    id: "more",
    title: "More",
    icon: Gift,
    url: "/affiliate",
    items: [
      { title: "Affiliate Program", url: "/affiliate", icon: Gift },
      { title: "Affiliate Dashboard", url: "/affiliate/dashboard", icon: BarChart3 },
      { title: "Affiliate Resources", url: "/affiliate/resources", icon: BookOpen },
    ],
  },
  {
    id: "admin",
    title: "Admin",
    icon: ShieldCheck,
    url: "/admin/affiliates",
    adminOnly: true,
    items: [
      { title: "Affiliate Admin", url: "/admin/affiliates", icon: Gift },
      { title: "Legal Documents", url: "/admin/legal", icon: ScrollText },
      { title: "Audit Log", url: "/admin/audit-log", icon: ScrollText },
      { title: "Security Log", url: "/admin/security-log", icon: ShieldCheck },
      { title: "Search Console", url: "/admin/search-console", icon: Search },
      { title: "Blog Analytics", url: "/admin/blog-analytics", icon: BarChart3 },
      { title: "Digest Preview", url: "/admin/digest-preview", icon: Mail },
      { title: "Paddle Customers", url: "/admin/paddle", icon: Wallet },
      { title: "Payments Status", url: "/admin/payments-status", icon: Activity },
    ],
  },
];
