"use client";

import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";

import { useSources } from "@/lib/SourcesContext";
import { SourceInfo } from "@/lib/types";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

function pageTitle(pathname: string, sources: SourceInfo[]): string {
  if (pathname === "/") return "Overview";
  if (pathname === "/settings") return "Settings";
  const match = pathname.match(/^\/sources\/([^/]+)/);
  if (match) {
    return sources.find((s) => s.id === match[1])?.name ?? "Source";
  }
  return "Scraper Dashboard";
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { sources } = useSources();
  const title = pageTitle(pathname, sources);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#f9f9f7" }}>
      <aside className="hidden w-64 flex-shrink-0 border-r border-gray-100 bg-white md:block">
        <Sidebar />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 h-full w-64 flex-shrink-0 bg-white shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
