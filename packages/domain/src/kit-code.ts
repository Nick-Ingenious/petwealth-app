import type { Panel, Species } from "./catalog";

/**
 * Kit codes are printed on the tube/QR label, e.g. `FFEC-002-946`:
 *
 *   F    FEC   -  002  -  946
 *   │    │        │       └─ serial within lot (3 digits)
 *   │    │        └─ manufacturing lot (3 digits)
 *   │    └─ panel: FEC | RES | ORA
 *   └─ species: C (canine) | F (feline)
 */

const SPECIES_CODE: Record<Species, string> = { dog: "C", cat: "F" };
const PANEL_CODE: Record<Panel, string> = { fecal: "FEC", respiratory: "RES", oral: "ORA" };

const SPECIES_BY_CODE = Object.fromEntries(
  Object.entries(SPECIES_CODE).map(([k, v]) => [v, k as Species]),
) as Record<string, Species>;
const PANEL_BY_CODE = Object.fromEntries(
  Object.entries(PANEL_CODE).map(([k, v]) => [v, k as Panel]),
) as Record<string, Panel>;

export const KIT_CODE_PATTERN = /^([CF])(FEC|RES|ORA)-(\d{3})-(\d{3})$/;

export interface ParsedKitCode {
  code: string;
  species: Species;
  panel: Panel;
  lot: string;
  serial: string;
}

/**
 * Normalise scanner / hand-typed input: trims, upper-cases, and converts the
 * unicode dashes and spaces some barcode scanners and keyboards emit.
 * `ffec 002 946` → `FFEC-002-946`.
 */
export function normalizeKitCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[‐-―−_\s]+/g, "-")
    .replace(/-+/g, "-");
}

/** Returns the parsed code, or `null` when the input is not a valid kit code. */
export function parseKitCode(input: string): ParsedKitCode | null {
  const code = normalizeKitCode(input);
  const match = KIT_CODE_PATTERN.exec(code);
  if (!match) return null;
  const [, s, p, lot, serial] = match as unknown as [string, string, string, string, string];
  const species = SPECIES_BY_CODE[s];
  const panel = PANEL_BY_CODE[p];
  if (!species || !panel) return null;
  return { code, species, panel, lot, serial };
}

export function formatKitCode(species: Species, panel: Panel, lot: number, serial: number): string {
  const pad = (n: number) => String(n).padStart(3, "0");
  return `${SPECIES_CODE[species]}${PANEL_CODE[panel]}-${pad(lot)}-${pad(serial)}`;
}
