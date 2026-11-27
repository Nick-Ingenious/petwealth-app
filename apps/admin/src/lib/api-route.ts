import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError, type StaffContext } from "@petwealth/api";
import { getStaff } from "./auth";

type Handler<P> = (ctx: { staff: StaffContext; req: NextRequest; params: P }) => Promise<unknown>;

const problem = (status: number, code: string, message: string, details?: unknown) =>
  NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });

/**
 * REST handler wrapper (versioned under /api/v1).
 * - Authenticates the staff session (bearer/API tokens arrive with MCP in M3).
 * - Rejects cross-site writes: mutating requests must be same-origin JSON.
 * - Maps AppError/ZodError to consistent `{ error: { code, message } }` bodies.
 */
export function apiRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.get("origin");
      if (origin && origin !== req.nextUrl.origin) return problem(403, "cross_origin", "Cross-origin requests are not allowed.");
      if (!req.headers.get("content-type")?.includes("application/json")) {
        return problem(415, "unsupported_media_type", "Send a JSON body with Content-Type: application/json.");
      }
    }
    const staff = await getStaff("api");
    if (!staff) return problem(401, "unauthenticated", "Sign in as Petwealth staff to use the API.");
    try {
      const data = await handler({ staff, req, params: await segment.params });
      return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof AppError) return problem(e.status, e.code, e.message, e.details);
      if (e instanceof z.ZodError) return problem(422, "invalid", "Request validation failed.", z.flattenError(e));
      if (e instanceof SyntaxError) return problem(400, "bad_json", "Request body is not valid JSON.");
      console.error("[api] unexpected error", e);
      return problem(500, "internal", "Internal error.");
    }
  };
}

/** Query-string params as a plain object, for zod parsing. */
export const searchParamsOf = (req: NextRequest) => Object.fromEntries(req.nextUrl.searchParams);
