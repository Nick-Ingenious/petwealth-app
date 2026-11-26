/**
 * Kit codes for DB tests. The test database keeps every kit from every run,
 * so a code picked from a small random range eventually repeats ("duplicate
 * key kits_code_unique", or "already registered"). These pick from the whole
 * range and skip codes that already exist.
 */
import { randomInt } from "node:crypto";
import { formatKitCode, type Panel, type Species } from "@petwealth/domain";
import { getDb, inArray, schema as s } from "@petwealth/db";

/** `n` kit codes that aren't in the database yet. With `sameLot`, they share one lot (like one box of kits). */
export async function freshKitCodes(n: number, species: Species, panel: Panel, opts: { sameLot?: boolean } = {}): Promise<string[]> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const lot = randomInt(100, 1000);
    const codes = new Set<string>();
    while (codes.size < n) codes.add(formatKitCode(species, panel, opts.sameLot ? lot : randomInt(100, 1000), randomInt(1000)));
    const list = [...codes];
    const taken = await getDb().select({ code: s.kits.code }).from(s.kits).where(inArray(s.kits.code, list));
    if (!taken.length) return list;
  }
  throw new Error("Couldn't find unused kit codes for the test");
}

/** One kit code that isn't in the database yet. */
export async function freshKitCode(species: Species, panel: Panel): Promise<string> {
  return (await freshKitCodes(1, species, panel))[0]!;
}
