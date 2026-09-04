"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { useSources } from "@/lib/SourcesContext";
import { colorForSource, tint } from "@/lib/theme";

import { DashboardIcon, PlusIcon, SettingsIcon } from "./icons";

function NavLink({
  href,
  active,
  children,
  accent,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-brand-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
      style={active && accent ? { backgroundColor: accent } : undefined}
    >
      {children}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { sources } = useSources();

  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto p-4" onClick={onNavigate}>
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          S
        </div>
        <div className="text-base font-bold leading-tight text-gray-900">
          Scraper
          <div className="text-[11px] font-medium text-gray-400">Dashboard</div>
        </div>
      </div>

      <NavLink href="/" active={pathname === "/"}>
        <DashboardIcon /> Overview
      </NavLink>

      <div>
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Collections
          </span>
          <Link
            href="/sources/new"
            title="Add a custom API source"
            className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-brand-600"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          {sources.map((source) => {
            const accent = colorForSource(source.id, sources);
            const active = pathname === `/sources/${source.id}`;
            return (
              <NavLink key={source.id} href={`/sources/${source.id}`} active={active} accent={accent}>
                <span
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                  style={{
                    backgroundColor: active ? "rgba(255,255,255,0.25)" : tint(accent, 0.16),
                    color: active ? "white" : accent,
                  }}
                >
                  {source.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">{source.name}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      <div className="mt-auto">
        <NavLink href="/settings" active={pathname === "/settings"}>
          <SettingsIcon /> Settings
        </NavLink>
      </div>
    </nav>
  );
}
