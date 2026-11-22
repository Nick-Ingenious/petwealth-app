"use client";

import { useActionState, useState } from "react";
import { BREEDS, type Species } from "@petwealth/domain";
import { Choice, LilacButton, TextField, fieldClass } from "@/components/fields";
import type { ActionResult } from "@/lib/action";
import { addPetAction } from "./actions";

export function PetForm({ lockedSpecies, returnTo }: { lockedSpecies: Species | null; returnTo: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addPetAction, null);
  const [species, setSpecies] = useState<Species | "">(lockedSpecies ?? "");
  const [breed, setBreed] = useState("");
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-5" onChange={(e) => {
      const t = e.target as unknown as HTMLInputElement;
      if (t.name === "species") setSpecies(t.value as Species);
    }}>
      <input type="hidden" name="returnTo" value={returnTo} />
      {lockedSpecies ? <input type="hidden" name="species" value={lockedSpecies} /> : null}
      <TextField name="name" label="Name" required error={err("name")} autoComplete="off" />
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-500">Birthday*</span>
        <input type="date" name="dateOfBirth" required max={today} className={fieldClass} />
        {err("dateOfBirth") ? <span className="mt-1 block text-sm text-red-600">{err("dateOfBirth")}</span> : null}
      </label>
      <TextField name="weightLbs" label="Weight (lbs)" required inputMode="decimal" error={err("weightLbs")} />

      <div>
        <Choice
          name={lockedSpecies ? "speciesDisplay" : "species"}
          legend="Species"
          disabled={Boolean(lockedSpecies)}
          defaultValue={lockedSpecies ?? undefined}
          error={err("species")}
          options={[
            { value: "dog", label: "🐶 Dog" },
            { value: "cat", label: "🐱 Cat" },
          ]}
        />
        {lockedSpecies ? <p className="mt-1 text-sm text-zinc-500">Species is set by the kit ID you scanned.</p> : null}
      </div>

      <label className="block">
        <span className="sr-only">Breed</span>
        <select name="breed" required value={breed} onChange={(e) => setBreed(e.target.value)} disabled={!species} className={fieldClass}>
          <option value="">{species ? "Breed*" : "Choose species first"}</option>
          {species ? BREEDS[species].map((b) => <option key={b}>{b}</option>) : null}
        </select>
        {err("breed") ? <span className="mt-1 block text-sm text-red-600">{err("breed")}</span> : null}
      </label>
      {breed === "Other" ? <TextField name="breedOther" label="Breed" required /> : null}

      <Choice name="sex" legend="Sex" error={err("sex")} options={[{ value: "male", label: "♂ Male" }, { value: "female", label: "♀ Female" }]} />
      <Choice name="spayedNeutered" legend="Spayed/Neutered" error={err("spayedNeutered")} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />

      {state && !state.ok && !state.fieldErrors ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
      <LilacButton type="submit" disabled={pending}>{pending ? "Adding…" : "Add Pet"}</LilacButton>
    </form>
  );
}
