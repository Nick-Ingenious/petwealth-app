import Link from "next/link";
import { buttonClasses } from "@petwealth/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-[60dvh] place-items-center p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">We couldn&apos;t find that</h1>
        <p className="mt-2 text-sm text-ink-muted">It may have been removed, or the link is wrong.</p>
        <Link href="/" className={buttonClasses("secondary", "md", "mt-6")}>Back to dashboard</Link>
      </div>
    </main>
  );
}
