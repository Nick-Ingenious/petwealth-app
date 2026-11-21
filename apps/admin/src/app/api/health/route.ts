import { NextResponse } from "next/server";
import { getDb, sql } from "@petwealth/db";

/** Liveness + DB check for uptime monitoring. Reveals nothing sensitive. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
