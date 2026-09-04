import "./globals.css";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { SourcesProvider } from "@/lib/SourcesContext";

export const metadata = {
  title: "Scraper Dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SourcesProvider>
          <DashboardShell>{children}</DashboardShell>
        </SourcesProvider>
      </body>
    </html>
  );
}
