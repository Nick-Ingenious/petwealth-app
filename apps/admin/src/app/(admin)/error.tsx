"use client";

import { Button } from "@petwealth/ui";

/** Friendly error boundary; details stay in server logs (digest links them). */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-card border border-line bg-surface p-10 text-center">
      <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
      <p className="mt-1 text-sm text-ink-muted">Try again. If it keeps happening, share this reference with engineering: {error.digest ?? "n/a"}</p>
      <Button className="mt-4" variant="secondary" onClick={reset}>Try again</Button>
    </div>
  );
}
