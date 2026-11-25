import Link from "next/link";
import { ChevronLeft, Pencil, Plus } from "lucide-react";
import { listMyPets } from "@petwealth/api";
import { cn } from "@petwealth/ui";
import { Screen } from "@/components/brand";
import { requireCustomer } from "@/lib/auth";
import { DeletePetButton } from "./pet-row-delete";

export const metadata = { title: "Manage Pets" };

const SEX = { male: "Male", female: "Female", unknown: null } as const;

function PetAvatar({ name, species, photoUrl }: { name: string; species: "dog" | "cat"; photoUrl: string | null }) {
  return (
    <span
      className={cn(
        "relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-full text-[17px] font-bold",
        species === "cat" ? "bg-[#FBF1DF] text-[#8A6321]" : "bg-[#CAB3FF] text-[#5B3FA8]",
      )}
      aria-hidden
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        (name.trim()[0] ?? "?").toUpperCase()
      )}
    </span>
  );
}

export default async function ManagePetsPage() {
  const ctx = await requireCustomer({ next: "/pets" });
  const pets = await listMyPets(ctx);
  return (
    <Screen>
      <header className="-mx-5 mb-6 flex items-center gap-4 border-b border-zinc-200 px-5 py-5">
        <Link href="/" aria-label="Back" className="p-1">
          <ChevronLeft className="size-7" />
        </Link>
        <h1 className="text-3xl font-semibold">Manage Pets</h1>
      </header>
      {pets.length === 0 ? <p className="py-6 text-center text-lg text-zinc-500">No pets yet. Add one to register a kit.</p> : null}
      <ul className="space-y-3">
        {pets.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-[14px] bg-[#F2ECFF] p-3">
            <PetAvatar name={p.name} species={p.species} photoUrl={p.photoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-ink">{p.name || "Unnamed pet"}</p>
              <p className="truncate text-sm text-[#6F6A64]">
                {[p.breed, p.sex ? SEX[p.sex] : null, p.weightLbs != null ? `${p.weightLbs} lbs` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Link href={`/pets/${p.id}`} aria-label={`Edit ${p.name}`} className="grid size-9 place-items-center rounded-full bg-white">
              <Pencil className="size-4" aria-hidden />
            </Link>
            <DeletePetButton petId={p.id} name={p.name} canDelete={p.kitCount === 0} />
          </li>
        ))}
      </ul>
      <Link
        href="/pets/new?returnTo=%2Fpets"
        className="mt-5 flex h-[50px] items-center justify-center gap-2 rounded-full border border-[#E7DFD4] bg-white text-base font-semibold text-ink"
      >
        <Plus className="size-5" aria-hidden /> Add New Pet
      </Link>
    </Screen>
  );
}
