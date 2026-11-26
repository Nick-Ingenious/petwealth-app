"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { createPet, ensurePetBreedAvatar, previewBreedAvatar } from "@petwealth/api";
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
  // Usually the form already drew the breed picture; if not, draw it after the response.
  if (!result.data.photoUrl) after(() => ensurePetBreedAvatar(result.data.id));
  redirect(safeReturn(form.get("returnTo"), result.data.id) as never);
}

/** The breed picture for the pet form ("Adding breed image" while it's drawn the first time). */
export async function breedAvatarAction(species: string, breed: string): Promise<ActionResult<{ url: string | null; failed: boolean }>> {
  return runAction((ctx) => previewBreedAvatar(ctx, { species, breed }));
}
