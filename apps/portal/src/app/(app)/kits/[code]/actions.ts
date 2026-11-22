"use server";

import { revalidatePath } from "next/cache";
import { markSampleCollected } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function sampleCollectedAction(code: string): Promise<ActionResult> {
  const r = await runAction(async (ctx) => {
    await markSampleCollected(ctx, code);
    return undefined;
  });
  if (r.ok) revalidatePath(`/kits/${code}`);
  return r;
}
