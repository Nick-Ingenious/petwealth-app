"use server";

import { revalidatePath } from "next/cache";
import { updateCustomer } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function updateCustomerAction(id: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction((staff) =>
    updateCustomer(staff, id, {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email"),
      phone: form.get("phone") ?? "",
      smsOptIn: form.get("smsOptIn") === "on",
    }),
  );
  if (!result.ok) return result;
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return { ok: true, data: undefined, message: "Customer saved." };
}
