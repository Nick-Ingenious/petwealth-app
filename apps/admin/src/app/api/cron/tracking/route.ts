import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { refreshTracking } from "@petwealth/api";
import { getCarrier } from "@petwealth/integrations/carrier";

/**
 * Vercel Cron (every 30 min, see vercel.json): poll FedEx for open shipments
 * and move kits along (picked up → "In Transit").
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is rejected.
 */
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let carrier;
  try {
    carrier = getCarrier();
  } catch (e) {
    // e.g. FedEx not configured yet in production: nothing to track, not an outage.
    console.warn(`[cron:tracking] skipped — ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ ok: true, skipped: "carrier_not_configured" });
  }
  try {
    const result = await refreshTracking({ carrier });
    console.info(`[cron:tracking] checked=${result.checked} updated=${result.updated} kitsMoved=${result.kitsMoved} errors=${result.errors.length}`);
    if (result.errors.length) console.warn("[cron:tracking] errors", result.errors);
    return NextResponse.json({ ok: true, ...result, errors: result.errors.length });
  } catch (e) {
    console.error("[cron:tracking] failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
