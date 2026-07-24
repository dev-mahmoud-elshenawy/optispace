import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-primary/80">
              <span className="inline-block size-1.5 rounded-full bg-chart-2 shadow-[0_0_8px_var(--chart-2)] animate-pulse-dot" />
              OptiSpace
            </div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-gradient">{title}</h1>
            {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? (
            <div
              className="flex shrink-0 items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
              style={{ animationDelay: "80ms" }}
            >
              {actions}
            </div>
          ) : null}
        </div>
        <div className="mt-5 h-px bg-gradient-to-r from-border via-border/40 to-transparent" />
      </header>
      <div
        className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
        style={{ animationDelay: "120ms" }}
      >
        {children}
      </div>
    </div>
  );
}
