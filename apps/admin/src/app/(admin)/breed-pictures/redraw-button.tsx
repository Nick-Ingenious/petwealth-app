"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@petwealth/ui";
import { redrawBreedAvatarAction } from "./actions";

/** "Redraw": a new AI picture for this breed (10 to 20 seconds). */
export function RedrawButton({ id, breed, petCount }: { id: string; breed: string; petCount: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const who = petCount === 1 ? "The 1 pet" : `All ${petCount} pets`;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          confirm(`Redraw the ${breed} picture? ${petCount ? `${who} showing it will get the new one.` : "No pet shows it yet."}`) &&
          start(async () => {
            setMessage(null);
            const r = await redrawBreedAvatarAction(id);
            setMessage(r.ok ? { ok: true, text: "Redrawn." } : { ok: false, text: r.error });
          })
        }
      >
        <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden /> {pending ? "Drawing…" : "Redraw"}
      </Button>
      {message ? <p className={message.ok ? "text-xs text-emerald-700" : "text-xs text-red-600"}>{message.text}</p> : null}
    </div>
  );
}
