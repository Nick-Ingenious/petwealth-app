import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SPECIES, type Species } from "@petwealth/domain";
import { Screen } from "@/components/brand";
import { PetForm } from "./pet-form";

export const metadata = { title: "Add Pet" };
/** Drawing a new breed picture can take 10 to 20 seconds. */
export const maxDuration = 60;

export default async function AddPetPage({ searchParams }: PageProps<"/pets/new">) {
  const sp = await searchParams;
  const species = typeof sp.species === "string" && (SPECIES as readonly string[]).includes(sp.species) ? (sp.species as Species) : null;
  const returnTo = typeof sp.returnTo === "string" ? sp.returnTo : "/";
  return (
    <Screen>
      <header className="-mx-5 mb-6 flex items-center gap-4 border-b border-zinc-200 px-5 py-5">
        <Link href={(returnTo.startsWith("/") ? returnTo : "/") as never} aria-label="Back" className="p-1">
          <ChevronLeft className="size-7" />
        </Link>
        <h1 className="text-3xl font-semibold">Add Pet</h1>
      </header>
      <PetForm lockedSpecies={species} returnTo={returnTo} />
    </Screen>
  );
}
