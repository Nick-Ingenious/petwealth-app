"use server";

import { revalidatePath } from "next/cache";
import { transitionKit } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

/** Staff-initiated status change from the kit detail page. */
export async function changeKitStatusAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction((staff) =>
    transitionKit(staff, {
      kitCode: String(form.get("kitCode") ?? ""),
      to: String(form.get("to") ?? "") as never,
      note: String(form.get("note") ?? "") || undefined,
    }),
  );
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Status updated." };
}
