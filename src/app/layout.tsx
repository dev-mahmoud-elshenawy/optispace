import type { Metadata } from "next";
import { Inter, Sora, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { Toaster } from "@/components/ui/sonner";
import { AzureDevOpsAutoSync } from "@/features/integrations/azure-devops/auto-sync";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OptiSpace",
  description: "Local-first personal workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
        {/* App-wide ambient backdrop — a faint grid + top glow that shows through the
            translucent sidebar and cards, giving every page depth (not just the dashboard). */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-grid opacity-40" />
          <div className="absolute -top-48 left-1/2 h-[34rem] w-[62rem] -translate-x-1/2 rounded-full bg-primary/[0.05] blur-[150px]" />
        </div>
        <ThemeProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>
          <CommandPalette />
          <KeyboardShortcuts />
          {/* Always on — due-date reminders have no external dependency, and ADO/Calendar
              syncs already no-op gracefully when their own config is missing. */}
          <AzureDevOpsAutoSync enabled />
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
