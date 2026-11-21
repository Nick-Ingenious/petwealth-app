"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@petwealth/ui";
import type { ActionResult } from "@/lib/action";
import { updatePetAction } from "./actions";

interface Props {
  id: string;
  initial: { name: string; species: "dog" | "cat"; breed: string; dateOfBirth: string };
  canEdit: boolean;
  speciesLocked: boolean;
}

export function PetForm({ id, initial, canEdit, speciesLocked }: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updatePetAction.bind(null, id), null);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={!canEdit || pending} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" defaultValue={initial.name} required />
        </Field>
        <Field label="Species" htmlFor="species" error={err("species")} hint={speciesLocked ? "Locked: kits are already linked." : undefined}>
          {speciesLocked ? <input type="hidden" name="species" value={initial.species} /> : null}
          <Select id="species" name={speciesLocked ? undefined : "species"} defaultValue={initial.species} disabled={speciesLocked}>
            <option value="dog">Dog</option>
            <option value="cat">Cat</option>
          </Select>
        </Field>
        <Field label="Breed" htmlFor="breed" error={err("breed")}>
          <Input id="breed" name="breed" defaultValue={initial.breed} />
        </Field>
        <Field label="Date of birth" htmlFor="dateOfBirth" error={err("dateOfBirth")}>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={initial.dateOfBirth} max={new Date().toISOString().slice(0, 10)} />
        </Field>
      </fieldset>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          {state ? <p role="status" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{state.ok ? state.message : state.error}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
