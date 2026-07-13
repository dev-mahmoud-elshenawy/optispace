import type { Metadata } from "next";
import { Inter, Sora, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { Toaster } from "@/components/ui/sonner";
import { getSearchIndex } from "@/features/search/queries";
import { AzureDevOpsAutoSync } from "@/features/integrations/azure-devops/auto-sync";
import { isAzureDevOpsEnabled } from "@/features/integrations/azure-devops/service";
import { isCalendarEnabled } from "@/features/calendar/service";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OptiSpace",
  description: "Local-first personal workspace",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const searchIndex = await getSearchIndex();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${sora.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Apply the saved theme before paint to avoid a flash (defaults to dark). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t!=='light');}catch(e){document.documentElement.classList.add('dark');}",
          }}
        />
      </head>
      <body suppressHydrationWarning className="h-dvh overflow-hidden bg-background text-foreground">
        <ThemeProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>
          <CommandPalette items={searchIndex} />
          <AzureDevOpsAutoSync enabled={isAzureDevOpsEnabled() || isCalendarEnabled()} />
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
