import "server-only";
import { z } from "zod";
import { AppError, requirePermission, type StaffContext } from "@petwealth/api";
import type { Permission } from "@petwealth/domain";
import { getStaff } from "./auth";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Wrap a server action body: authenticates the caller, then maps validation
 * and domain errors into a serialisable result the form can render.
 * (Services re-check permissions themselves — this is defence in depth.)
 */
export async function runAction<T>(fn: (staff: StaffContext) => Promise<T>, opts?: { permission?: Permission }): Promise<ActionResult<T>> {
  const staff = await getStaff();
  if (!staff) return { ok: false, error: "Your session has expired. Sign in again." };
  try {
    if (opts?.permission) requirePermission(staff, opts.permission);
    return { ok: true, data: await fn(staff) };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[] | undefined> };
    }
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error("[action] unexpected error", e);
    return { ok: false, error: "Something went wrong. The error has been logged." };
  }
}
