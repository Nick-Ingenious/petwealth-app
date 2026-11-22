"use server";

import { checkKitCode, registerMyKits } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function checkKitAction(code: string) {
  return runAction((ctx) => checkKitCode(ctx, code));
}

export async function registerKitsAction(kits: { kitCode: string; petId: string }[]): Promise<ActionResult<{ firstCode: string }>> {
  return runAction(async (ctx) => {
    const res = await registerMyKits(ctx, { kits });
    return { firstCode: res.kits[0]!.code };
  });
}
