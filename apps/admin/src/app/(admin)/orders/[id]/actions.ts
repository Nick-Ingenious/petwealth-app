"use server";

import { revalidatePath } from "next/cache";
import { addOrderNote, saveOutboundShipment } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

/** Post a staff note to the order's activity log. */
export async function addOrderNoteAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const orderId = String(form.get("orderId") ?? "");
  const result = await runAction((staff) => addOrderNote(staff, { orderId, note: String(form.get("note") ?? "") }));
  if (!result.ok) return result;
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, data: undefined, message: "Note posted." };
}

/** Save the outbound tracking number (and optional note) from the shipping dialog. */
export async function saveShippingAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const orderId = String(form.get("orderId") ?? "");
  const result = await runAction((staff) =>
    saveOutboundShipment(staff, {
      orderId,
      trackingNumber: String(form.get("trackingNumber") ?? ""),
      note: String(form.get("note") ?? "") || undefined,
    }),
  );
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Shipping information saved." };
}
