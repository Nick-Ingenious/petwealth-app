"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@petwealth/ui";
import { removePetPhotoAction, setPetPhotoAction } from "./actions";

const MAX_SIDE = 600;

/** Shrink to at most 600px on the long side and re-encode as JPEG, so uploads stay small. */
async function resize(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * 90px pet avatar at the top of the pet form. Shows, in order: the photo the
 * customer chose, the AI breed picture, or the pet's initial. On an existing
 * pet (`petId`), tapping it uploads a photo; "Remove custom photo (Use AI
 * Avatar)" goes back to the breed picture.
 */
export function PetPhoto({
  petId,
  name,
  species,
  customUrl,
  breedUrl,
  breedPending,
  breedFailed,
  onCustomChange,
  onBreedUrl,
}: {
  petId?: string;
  name: string;
  species: "dog" | "cat" | "";
  customUrl: string | null;
  breedUrl: string | null;
  breedPending: boolean;
  breedFailed: boolean;
  onCustomChange: (url: string | null) => void;
  onBreedUrl: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<"photo" | "breed" | null>(null);
  const [, start] = useTransition();
  const url = customUrl ?? breedUrl;
  const busy = working !== null || breedPending;

  function choose(file: File | undefined) {
    if (!file || !petId) return;
    setError(null);
    setWorking("photo");
    start(async () => {
      try {
        const res = await setPetPhotoAction(petId, await resize(file));
        if (res.ok) onCustomChange(res.data.photoUrl);
        else setError(res.error);
      } catch {
        setError("We could not add that photo. Try another one.");
      } finally {
        setWorking(null);
      }
    });
  }

  function switchToAiAvatar() {
    if (!petId) return;
    setError(null);
    setWorking("breed");
    start(async () => {
      const res = await removePetPhotoAction(petId);
      if (res.ok) {
        onCustomChange(null);
        onBreedUrl(res.data.photoUrl);
      } else setError(res.error);
      setWorking(null);
    });
  }

  const avatar = (
    <>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 size-full rounded-full object-cover" />
      ) : (
        (name.trim()[0] ?? "").toUpperCase()
      )}
      {petId ? (
        <span className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full bg-white text-ink shadow">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        </span>
      ) : busy ? (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-white/60">
          <Loader2 className="size-6 animate-spin text-[#5B3FA8]" aria-hidden />
        </span>
      ) : null}
    </>
  );
  const circle = cn(
    "relative grid size-[90px] place-items-center rounded-full text-[26px] font-semibold",
    species === "cat" ? "bg-[#FBF1DF] text-[#8A6321]" : "bg-[#F2ECFF] text-[#5B3FA8]",
  );

  return (
    <div className="flex flex-col items-center gap-2">
      {petId ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={customUrl ? `Change ${name}'s photo` : `Add a photo of ${name}`}
          className={circle}
        >
          {avatar}
        </button>
      ) : (
        <div className={circle} aria-hidden>
          {avatar}
        </div>
      )}
      {petId ? <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} /> : null}
      <p aria-live="polite" className="text-sm text-zinc-500">
        {working === "photo" ? "Adding photo" : working === "breed" || breedPending ? "Adding breed image" : breedFailed && !url ? "Breed image unavailable." : ""}
      </p>
      {customUrl && !busy ? (
        <button type="button" className="text-sm text-[#5B3FA8] underline" onClick={switchToAiAvatar}>
          Remove custom photo (Use AI Avatar)
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[#9C3535]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
