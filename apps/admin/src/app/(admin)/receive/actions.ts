"use server";

import { revalidatePath } from "next/cache";
import { receiveKit } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export type ReceiveResult = ActionResult<{ code: string; petName: string | null; warnings: string[] }>;

export async function receiveKitAction(kitCode: string): Promise<ReceiveResult> {
  const result = await runAction(async (staff) => {
    const r = await receiveKit(staff, { kitCode });
    return { code: r.kit.code!, petName: r.pet?.name ?? null, warnings: r.warnings };
  });
  if (result.ok) revalidatePath("/receive");
  return result;
}
