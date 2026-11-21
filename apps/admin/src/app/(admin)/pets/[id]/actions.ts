"use server";

import { revalidatePath } from "next/cache";
import { updatePet } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function updatePetAction(id: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction((staff) =>
    updatePet(staff, id, {
      name: form.get("name"),
      species: form.get("species"),
      breed: form.get("breed") ?? "",
      dateOfBirth: form.get("dateOfBirth") ?? "",
    }),
  );
  if (!result.ok) return result;
  revalidatePath(`/pets/${id}`);
  revalidatePath("/pets");
  return { ok: true, data: undefined, message: "Pet saved." };
}
