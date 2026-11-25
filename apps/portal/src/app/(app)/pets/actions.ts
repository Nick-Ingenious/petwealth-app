"use server";

import { revalidatePath } from "next/cache";
import { deleteMyPet } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function deletePetAction(petId: string): Promise<ActionResult> {
  const result = await runAction(async (ctx) => {
    await deleteMyPet(ctx, petId);
    return undefined;
  });
  if (result.ok) revalidatePath("/pets");
  return result;
}
