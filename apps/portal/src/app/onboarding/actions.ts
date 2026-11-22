"use server";

import { redirect } from "next/navigation";
import { completeOnboarding } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";
import { safeNext } from "@/lib/auth";

export async function onboardingAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const hasAddressFields = Boolean(form.get("line1"));
  const result = await runAction((ctx) =>
    completeOnboarding(ctx, {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      phone: form.get("phone"),
      customerType: form.get("customerType"),
      smsOptIn: form.get("smsOptIn"),
      ...(hasAddressFields
        ? { address: { line1: form.get("line1"), line2: form.get("line2"), city: form.get("city"), region: form.get("region"), postalCode: form.get("postalCode") } }
        : {}),
    }),
  );
  if (!result.ok) return result;
  redirect(safeNext(form.get("next")) as never);
}
