import Link from "next/link";
import { Screen, Wordmark } from "@/components/brand";

export default function NotFound() {
  return (
    <Screen>
      <div className="flex flex-col items-center gap-4 pt-24 text-center">
        <Wordmark />
        <h1 className="text-3xl font-semibold">We couldn&apos;t find that</h1>
        <p className="text-zinc-500">The kit or page may belong to another account, or the link is wrong.</p>
        <Link href="/" className="mt-4 rounded-full bg-ink px-8 py-4 font-semibold text-white">Go to Dashboard</Link>
      </div>
    </Screen>
  );
}
