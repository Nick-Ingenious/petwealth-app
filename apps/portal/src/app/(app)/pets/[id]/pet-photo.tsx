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

/** 90px avatar: tap to choose a photo; shows the pet's initial until there is one. */
export function PetPhoto({ petId, name, species, photoUrl }: { petId: string; name: string; species: "dog" | "cat"; photoUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(photoUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const dataUrl = await resize(file);
        const res = await setPetPhotoAction(petId, dataUrl);
        if (res.ok) setUrl(res.data.photoUrl);
        else setError(res.error);
      } catch {
        setError("We could not add that photo. Try another one.");
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        aria-label={url ? `Change ${name}'s photo` : `Add a photo of ${name}`}
        className={cn(
          "relative grid size-[90px] place-items-center rounded-full text-[26px] font-semibold",
          species === "cat" ? "bg-[#FBF1DF] text-[#8A6321]" : "bg-[#F2ECFF] text-[#5B3FA8]",
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 size-full rounded-full object-cover" />
        ) : (
          (name.trim()[0] ?? "?").toUpperCase()
        )}
        <span className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full bg-white text-ink shadow">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      {pending ? <p className="text-sm text-zinc-500">Adding photo</p> : null}
      {url && !pending ? (
        <button
          type="button"
          className="text-sm text-[#5B3FA8] underline"
          onClick={() =>
            start(async () => {
              const res = await removePetPhotoAction(petId);
              if (res.ok) setUrl(null);
              else setError(res.error);
            })
          }
        >
          Remove photo
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
