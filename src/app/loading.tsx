export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-52 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted/70" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border/60 bg-card" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="h-44 animate-pulse rounded-xl border border-border/60 bg-card" />
        <div className="h-44 animate-pulse rounded-xl border border-border/60 bg-card" />
      </div>
    </div>
  );
}
