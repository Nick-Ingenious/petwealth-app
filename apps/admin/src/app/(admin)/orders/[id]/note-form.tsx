"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { Button, Input } from "@petwealth/ui";
import type { ActionResult } from "@/lib/action";
import { addOrderNoteAction } from "./actions";

export function NoteForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addOrderNoteAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex gap-3">
        <Input name="note" aria-label="Note" placeholder="Leave a note about this order…" maxLength={1000} required autoComplete="off" className="h-11" />
        <Button type="submit" variant="brand" disabled={pending} className="h-11 shrink-0">
          <Send className="size-4" aria-hidden />
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.fieldErrors?.note?.[0] ?? state.error}
        </p>
      ) : null}
    </form>
  );
}
