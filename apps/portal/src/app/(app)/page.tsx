import Link from "next/link";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import { getPortalHome } from "@petwealth/api";
import { PANEL_LABEL, SPECIES_LABEL } from "@petwealth/domain";
import { cn } from "@petwealth/ui";
import { Header, KitImage, Screen } from "@/components/brand";
import { requireCustomer } from "@/lib/auth";

export const metadata = { title: "Dashboard" };

const NEXT_STEP: Record<string, string> = {
  activate: "Finish activating",
  collect: "Collect the sample",
  ship: "Ship it to the lab",
  results: "At the lab",
};

export default async function HomePage() {
  const ctx = await requireCustomer({ next: "/" });
  const home = await getPortalHome(ctx);

  return (
    <Screen>
      <Header />
      <h1 className="mt-4 text-4xl font-light">
        Hi{home.profile.firstName ? <strong className="font-semibold">, {home.profile.firstName}</strong> : null}
      </h1>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">In progress</h2>
        {home.activeKits.length === 0 ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
            <p className="text-lg">No kits in progress.</p>
            <p className="mt-1 text-zinc-500">Got a PetWealth kit? Scan the QR code on the tube to get started.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {home.activeKits.map((k) => (
              <li key={k.id}>
                <Link href={`/kits/${k.code}`} className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm">
                  <span className="w-20 shrink-0" aria-hidden>
                    <KitImage species={k.species} panel={k.panel} className="h-auto w-full object-contain" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold">
                      {k.pet?.name ?? "Unassigned"} · {PANEL_LABEL[k.panel]}
                    </span>
                    <span className={cn("block text-sm", k.journey.step === "results" ? "text-zinc-500" : "font-medium text-amber-600")}>
                      {k.journey.step === "results" ? k.statusLabel : NEXT_STEP[k.journey.step]}
                    </span>
                    <span className="block font-mono text-xs text-zinc-400">{k.code}</span>
                  </span>
                  <ChevronRight className="size-5 text-zinc-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/register" className="mt-4 flex h-14 items-center justify-center gap-2 rounded-full bg-ink text-lg font-semibold text-white">
          Register a kit <ArrowRight className="size-5" aria-hidden />
        </Link>
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Your pets</h2>
          <Link href="/pets/new?returnTo=%2F" className="flex items-center gap-1 text-sm font-semibold text-violet-700">
            <Plus className="size-4" aria-hidden /> Add pet
          </Link>
        </div>
        {home.pets.length === 0 ? (
          <p className="text-zinc-500">No pets yet. You&apos;ll add them when you register a kit.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {home.pets.map((p) => (
              <li key={p.id} className="rounded-3xl bg-white p-4 shadow-sm">
                <span className="text-3xl" aria-hidden>{p.species === "dog" ? "🐶" : "🐱"}</span>
                <p className="mt-1 text-lg font-semibold">{p.name}</p>
                <p className="text-sm text-zinc-500">{p.breed ?? SPECIES_LABEL[p.species].noun}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {home.completedKits.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Results</h2>
          <ul className="space-y-2">
            {home.completedKits.map((k) => (
              <li key={k.id}>
                <Link href={`/kits/${k.code}`} className="flex items-center justify-between rounded-2xl bg-white p-4">
                  <span>
                    {k.pet?.name} · {PANEL_LABEL[k.panel]}
                  </span>
                  <span className="text-sm font-medium text-emerald-700">Results ready</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Screen>
  );
}
