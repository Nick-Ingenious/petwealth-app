"use server";

import { redirect } from "next/navigation";
import { createPet } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

/** Only allow returning to our own register/home pages after adding a pet. */
function safeReturn(raw: FormDataEntryValue | null, petId: string): string {
  const v = typeof raw === "string" ? raw : "";
  if (!v.startsWith("/register") && v !== "/" && v !== "/pets") return "/";
  const url = new URL(v, "http://x");
  if (url.pathname === "/register") url.searchParams.append("pet", petId);
  return url.pathname + url.search;
}

export async function addPetAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction((ctx) =>
    createPet(ctx, {
      name: form.get("name"),
      species: form.get("species"),
      dateOfBirth: form.get("dateOfBirth"),
      weightLbs: form.get("weightLbs"),
      breed: form.get("breed") === "Other" ? form.get("breedOther") || "Other" : form.get("breed"),
      sex: form.get("sex"),
      spayedNeutered: form.get("spayedNeutered"),
    }),
  );
  if (!result.ok) return result;
  redirect(safeReturn(form.get("returnTo"), result.data.id) as never);
}
