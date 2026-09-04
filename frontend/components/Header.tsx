"use client";

import { MenuIcon } from "./icons";

export function Header({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return (
    <header className="flex h-16 flex-shrink-0 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        className="text-gray-500 md:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <MenuIcon />
      </button>
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>
    </header>
  );
}
