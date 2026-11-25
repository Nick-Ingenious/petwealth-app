import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AppError, getMyPet } from "@petwealth/api";
import { Screen } from "@/components/brand";
import { requireCustomer } from "@/lib/auth";
import { PetForm } from "../new/pet-form";
import { DeletePetButton } from "../pet-row-delete";
import { updatePetAction } from "./actions";
import { PetPhoto } from "./pet-photo";

export const metadata = { title: "Edit Pet" };

export default async function EditPetPage({ params }: PageProps<"/pets/[id]">) {
  const { id } = await params;
  const ctx = await requireCustomer({ next: `/pets/${id}` });
  const pet = await getMyPet(ctx, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const hasKits = pet.kitCount > 0;
  return (
    <Screen>
      <header className="-mx-5 mb-6 flex items-center gap-4 border-b border-zinc-200 px-5 py-5">
        <Link href="/pets" aria-label="Back" className="p-1">
          <ChevronLeft className="size-7" />
        </Link>
        <h1 className="flex-1 text-3xl font-semibold">Edit Pet</h1>
        {!hasKits ? <DeletePetButton petId={pet.id} name={pet.name} canDelete redirectTo="/pets" /> : null}
      </header>
      <div className="mb-6">
        <PetPhoto petId={pet.id} name={pet.name} species={pet.species} photoUrl={pet.photoUrl} />
      </div>
      <PetForm
        lockedSpecies={hasKits ? pet.species : null}
        lockedReason="Species cannot be changed after a kit has been assigned to this pet."
        returnTo="/pets"
        initial={pet}
        formAction={updatePetAction.bind(null, pet.id)}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </Screen>
  );
}
