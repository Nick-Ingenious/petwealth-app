"use server";

import { revalidatePath } from "next/cache";
import { registerKitsAsStaff, retryReturnLabel, type RegistrationResult } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function registerKitsAction(customerId: string, kits: { kitCode: string; petId: string }[]): Promise<ActionResult<RegistrationResult>> {
  const result = await runAction((staff) => registerKitsAsStaff(staff, customerId, { kits }));
  if (result.ok) revalidatePath(`/customers/${customerId}`);
  return result;
}

export async function retryLabelAction(customerId: string, shipmentId: string): Promise<ActionResult<{ status: string; error?: string }>> {
  const result = await runAction((staff) => retryReturnLabel(staff, shipmentId));
  if (result.ok) revalidatePath(`/customers/${customerId}`);
  return result;
}
