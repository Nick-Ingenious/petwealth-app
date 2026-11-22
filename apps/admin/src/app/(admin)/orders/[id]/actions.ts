"use server";

import { revalidatePath } from "next/cache";
import { addOrderNote } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

/** Post a staff note to the order's activity log. */
export async function addOrderNoteAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const orderId = String(form.get("orderId") ?? "");
  const result = await runAction((staff) => addOrderNote(staff, { orderId, note: String(form.get("note") ?? "") }));
  if (!result.ok) return result;
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, data: undefined, message: "Note posted." };
}
