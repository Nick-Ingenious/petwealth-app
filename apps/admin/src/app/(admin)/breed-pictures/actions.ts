"use server";

import { revalidatePath } from "next/cache";
import { redrawBreedAvatar } from "@petwealth/api";
import { BreedAvatarError } from "@petwealth/integrations/ai";
import { runAction, type ActionResult } from "@/lib/action";

/** Draw a breed's picture again; every pet showing it switches to the new one. */
export async function redrawBreedAvatarAction(id: string): Promise<ActionResult<{ pets: number }>> {
  const result = await runAction(async (staff) => {
    try {
      return { failed: false, pets: (await redrawBreedAvatar(staff, id)).pets };
    } catch (e) {
      if (!(e instanceof BreedAvatarError)) throw e;
      console.warn(`[breed-avatar] redraw ${id}: ${e.message}`);
      return { failed: true, pets: 0 };
    }
  });
  if (!result.ok) return result;
  if (result.data.failed) return { ok: false, error: "The picture couldn't be drawn. Try again in a minute." };
  revalidatePath("/breed-pictures");
  return { ok: true, data: { pets: result.data.pets } };
}
