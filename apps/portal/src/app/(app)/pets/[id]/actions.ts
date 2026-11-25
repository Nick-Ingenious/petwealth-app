"use server";

import { revalidatePath } from "next/cache";
import { removeMyPetPhoto, setMyPetPhoto, updateMyPet } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function updatePetAction(petId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction(async (ctx) => {
    await updateMyPet(ctx, petId, {
      name: form.get("name"),
      species: form.get("species"),
      dateOfBirth: form.get("dateOfBirth"),
      weightLbs: form.get("weightLbs"),
      breed: form.get("breed") === "Other" ? form.get("breedOther") || "Other" : form.get("breed"),
      sex: form.get("sex"),
      spayedNeutered: form.get("spayedNeutered"),
    });
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

export async function removePetPhotoAction(petId: string): Promise<ActionResult> {
  const result = await runAction(async (ctx) => {
    await removeMyPetPhoto(ctx, petId);
    return undefined;
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
