import Link from "next/link";
import { QrCode } from "lucide-react";

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="font-serif text-2xl font-bold tracking-tight text-ink">petwealth</span>
      <span className="rounded-md bg-lilac-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-violet-600">BETA</span>
    </span>
  );
}

/** App header: wordmark + the "Code" shortcut to register kits. */
export function Header({ showCode = true }: { showCode?: boolean }) {
  return (
    <header className="flex items-center justify-between py-5">
      <Link href="/" aria-label="PetWealth home">
        <Wordmark />
      </Link>
      {showCode ? (
        <Link href="/register" className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
          <QrCode className="size-4" aria-hidden /> Code
        </Link>
      ) : null}
    </header>
  );
}

/** Narrow, centered column — the portal is designed for phones first. */
export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-md px-5 pb-16">{children}</div>;
}
