"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { BREEDS, type Species } from "@petwealth/domain";
import { Choice, LilacButton, TextField, fieldClass } from "@/components/fields";
import type { ActionResult } from "@/lib/action";
import { PetPhoto } from "../[id]/pet-photo";
import { addPetAction, breedAvatarAction } from "./actions";

export interface PetInitial {
  name: string;
  species: Species;
  breed: string | null;
  dateOfBirth: string | null;
  weightLbs: number | null;
  sex: "male" | "female" | "unknown" | null;
  spayedNeutered: boolean | null;
}

/** Existing pet's avatar: its id, current photo URL, and whether the customer chose that photo. */
export interface PetPhotoInitial {
  petId: string;
  photoUrl: string | null;
  custom: boolean;
}

/** Breeds from the picker get an AI picture; "Other" (free text) doesn't. */
const hasBreedPicture = (species: Species | "", breed: string) => Boolean(species && breed && breed !== "Other" && BREEDS[species].includes(breed));

/**
 * Add Pet, and Edit Pet when `initial` and `formAction` are given. Edit passes
 * its own action (bound to the pet id) and a reason when species is locked.
 */
export function PetForm({
  lockedSpecies,
  lockedReason,
  returnTo,
  initial,
  photo,
  formAction,
  submitLabel = "Add Pet",
  pendingLabel = "Adding…",
}: {
  lockedSpecies: Species | null;
  lockedReason?: string;
  returnTo: string;
  initial?: PetInitial;
  photo?: PetPhotoInitial;
  formAction?: (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
  submitLabel?: string;
  pendingLabel?: string;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    formAction ?? addPetAction,
    null,
  );
  const [species, setSpecies] = useState<Species | "">(lockedSpecies ?? initial?.species ?? "");
  const knownBreed = initial?.breed && species && BREEDS[species].includes(initial.breed);
  const [breed, setBreed] = useState(initial?.breed ? (knownBreed ? initial.breed : "Other") : "");
  const [name, setName] = useState(initial?.name ?? "");
  const [customUrl, setCustomUrl] = useState(photo?.custom ? photo.photoUrl : null);
  const [breedUrl, setBreedUrl] = useState(photo && !photo.custom ? photo.photoUrl : null);
  const [breedPending, setBreedPending] = useState(false);
  const [breedFailed, setBreedFailed] = useState(false);
  const latest = useRef(0);

  /** Draw (or fetch) the breed picture; only the most recent choice wins. */
  function pickBreed(nextSpecies: Species | "", nextBreed: string) {
    const ticket = ++latest.current;
    setBreedFailed(false);
    if (!hasBreedPicture(nextSpecies, nextBreed)) {
      setBreedUrl(null);
      setBreedPending(false);
      return;
    }
    setBreedUrl(null); // show the initial, not the previous breed, while this one loads
    setBreedPending(true);
    breedAvatarAction(nextSpecies, nextBreed)
      .then((res) => {
        if (ticket !== latest.current) return;
        setBreedUrl(res.ok ? res.data.url : null);
        setBreedFailed(!res.ok || res.data.failed);
      })
      .catch(() => ticket === latest.current && setBreedFailed(true))
      .finally(() => ticket === latest.current && setBreedPending(false));
  }
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      className="space-y-5"
      // Submit by hand so React doesn't clear the form when the server sends back an error.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement;
        if (t.name === "name") setName(t.value);
        if (t.name === "species" && t.value !== species) {
          // A new species clears the breed (and its picture).
          setSpecies(t.value as Species);
          setBreed("");
          pickBreed(t.value as Species, "");
        }
      }}
    >
      <PetPhoto
        petId={photo?.petId}
        name={name}
        species={species}
        customUrl={customUrl}
        breedUrl={breedUrl}
        breedPending={breedPending}
        breedFailed={breedFailed}
        onCustomChange={setCustomUrl}
        onBreedUrl={setBreedUrl}
      />
      <input type="hidden" name="returnTo" value={returnTo} />
      {lockedSpecies ? <input type="hidden" name="species" value={lockedSpecies} /> : null}
      <TextField
        showLabel={Boolean(initial)}
        name="name"
        label="Name"
        required
        error={err("name")}
        autoComplete="off"
        defaultValue={initial?.name}
        maxLength={80}
      />
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-500">Birthday*</span>
        <input
          type="date"
          name="dateOfBirth"
          required
          max={today}
          defaultValue={initial?.dateOfBirth ?? undefined}
          className={fieldClass}
        />
        {err("dateOfBirth") ? (
          <span className="mt-1 block text-sm text-red-600">{err("dateOfBirth")}</span>
        ) : null}
      </label>
      <TextField
        showLabel={Boolean(initial)}
        name="weightLbs"
        label="Weight (lbs)"
        required
        inputMode="decimal"
        error={err("weightLbs")}
        defaultValue={initial?.weightLbs ?? undefined}
      />

      <div>
        <Choice
          name={lockedSpecies ? "speciesDisplay" : "species"}
          legend="Species"
          disabled={Boolean(lockedSpecies)}
          defaultValue={lockedSpecies ?? initial?.species}
          error={err("species")}
          options={[
            { value: "dog", label: "🐶 Dog" },
            { value: "cat", label: "🐱 Cat" },
          ]}
        />
        {lockedSpecies ? (
          <p className="mt-1 text-sm text-zinc-500">
            {lockedReason ?? "Species is set by the kit ID you scanned."}
          </p>
        ) : null}
      </div>

      <label className="block">
        <span className={initial ? "mb-1 block text-sm text-zinc-500" : "sr-only"}>Breed</span>
        <select
          name="breed"
          required
          value={breed}
          onChange={(e) => {
            setBreed(e.target.value);
            pickBreed(species, e.target.value);
          }}
          disabled={!species}
          className={fieldClass}
        >
          <option value="">{species ? "Breed*" : "Choose species first"}</option>
          {species ? BREEDS[species].map((b) => <option key={b}>{b}</option>) : null}
        </select>
        {err("breed") ? (
          <span className="mt-1 block text-sm text-red-600">{err("breed")}</span>
        ) : null}
      </label>
      {breed === "Other" ? (
        <TextField
          name="breedOther"
          label="Breed"
          required
          defaultValue={
            initial?.breed && !knownBreed && initial.breed !== "Other" ? initial.breed : undefined
          }
        />
      ) : null}

      <Choice
        name="sex"
        legend="Sex"
        error={err("sex")}
        defaultValue={
          initial?.sex === "male" || initial?.sex === "female" ? initial.sex : undefined
        }
        options={[
          { value: "male", label: "♂ Male" },
          { value: "female", label: "♀ Female" },
        ]}
      />
      <Choice
        name="spayedNeutered"
        legend="Spayed/Neutered"
        error={err("spayedNeutered")}
        defaultValue={
          initial?.spayedNeutered == null ? undefined : initial.spayedNeutered ? "yes" : "no"
        }
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]}
      />

      {state && !state.ok && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="text-center text-sm font-medium text-emerald-700">
          {state.message}
        </p>
      ) : null}
      <LilacButton type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </LilacButton>
    </form>
  );
}
