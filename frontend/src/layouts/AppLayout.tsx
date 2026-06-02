import { Outlet } from "react-router-dom";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { DynamicBreadcrumbs } from "@/components/ui/breadcrumb";
import FintsAutoSync from "@/components/fints-auto-sync";
import { GlobalDateFilterProvider } from "@/hooks/use-global-date-filter";

export default function AppLayout() {
  return (
    <GlobalDateFilterProvider>
      <SidebarProvider>
        <FintsAutoSync />
        <AppSidebar />
        <SidebarInset>
          <header className="flex shrink-0 items-center justify-between w-full transition-[width,height] ease-linear h-12 px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <DynamicBreadcrumbs />
            </div>
          </header>

          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <main className="flex flex-col gap-4 p-4 pt-0">
                <Outlet />
              </main>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </GlobalDateFilterProvider>
  );
}
