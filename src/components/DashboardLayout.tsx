import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GuestBanner } from "@/components/GuestBanner";
import { NotificationsBell } from "@/components/NotificationsBell";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <PaymentTestModeBanner />
          <GuestBanner />
          <header className="h-14 flex items-center justify-between border-b border-border px-4 shrink-0">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <NotificationsBell />
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
