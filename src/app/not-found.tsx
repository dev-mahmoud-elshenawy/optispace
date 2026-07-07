import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-heading text-5xl font-bold tracking-tight text-gradient">404</p>
      <p className="text-sm text-muted-foreground">That page doesn&rsquo;t exist.</p>
      <Button asChild>
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
