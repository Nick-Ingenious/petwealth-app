import "server-only";
import { z } from "zod";
import { AppError, type CustomerContext } from "@petwealth/api";
import { getCustomer } from "./auth";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/** Run a customer server action: authenticate, then map errors to friendly messages. */
export async function runAction<T>(fn: (ctx: CustomerContext) => Promise<T>): Promise<ActionResult<T>> {
  const ctx = await getCustomer();
  if (!ctx) return { ok: false, error: "Please sign in again." };
  try {
    return { ok: true, data: await fn(ctx) };
  } catch (e) {
    if (e instanceof z.ZodError) {
      const flat = z.flattenError(e);
      return { ok: false, error: flat.formErrors[0] ?? "Please check the highlighted fields.", fieldErrors: flat.fieldErrors as Record<string, string[] | undefined> };
    }
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error("[portal action] unexpected error", e);
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}
