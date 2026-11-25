"use server";

import { revalidatePath } from "next/cache";
import { updateMyProfile } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function updateProfileAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction(async (ctx) => {
    await updateMyProfile(ctx, {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      phone: form.get("phone"),
      smsOptIn: form.get("smsOptIn"),
      address: { line1: form.get("line1"), line2: form.get("line2"), city: form.get("city"), region: form.get("region"), postalCode: form.get("postalCode") },
    });
    return undefined;
  });
  if (result.ok) {
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Saved." };
  }
  return result;
}
