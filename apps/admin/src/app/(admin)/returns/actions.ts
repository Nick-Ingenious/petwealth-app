"use server";

import { revalidatePath } from "next/cache";
import { refreshReturnTracking, retryReturnLabel } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

/** Ask FedEx again for a return code that failed. */
export async function retryReturnAction(shipmentId: string): Promise<ActionResult> {
  const result = await runAction(async (staff) => {
    await retryReturnLabel(staff, shipmentId);
    return undefined;
  });
  revalidatePath("/returns");
  return result;
}

/** Check FedEx tracking now instead of waiting for the next automatic check. */
export async function refreshTrackingAction(shipmentId: string): Promise<ActionResult<{ changed: boolean }>> {
  const result = await runAction(async (staff) => {
    const r = await refreshReturnTracking(staff, shipmentId);
    return { changed: r.changed };
  });
  revalidatePath("/returns");
  return result;
}
