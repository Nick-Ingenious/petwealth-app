"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { ensurePetBreedAvatar, removeMyPetPhoto, setMyPetPhoto, updateMyPet } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function updatePetAction(petId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction(async (ctx) => {
    const pet = await updateMyPet(ctx, petId, {
      name: form.get("name"),
      species: form.get("species"),
      dateOfBirth: form.get("dateOfBirth"),
      weightLbs: form.get("weightLbs"),
      breed: form.get("breed") === "Other" ? form.get("breedOther") || "Other" : form.get("breed"),
      sex: form.get("sex"),
      spayedNeutered: form.get("spayedNeutered"),
    });
    if (!pet.photoUrl) after(() => ensurePetBreedAvatar(pet.id));
    return undefined;
  });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Saved." };
}

export async function setPetPhotoAction(petId: string, dataUrl: string): Promise<ActionResult<{ photoUrl: string }>> {
  const result = await runAction((ctx) => setMyPetPhoto(ctx, petId, dataUrl));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** "Remove custom photo (Use AI Avatar)": back to the breed picture. */
export async function removePetPhotoAction(petId: string): Promise<ActionResult<{ photoUrl: string | null }>> {
  const result = await runAction((ctx) => removeMyPetPhoto(ctx, petId));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
