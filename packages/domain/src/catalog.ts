/**
 * Product vocabulary shared by every app: species, test panels, and how a
 * purchased test type expands into physical kits.
 */

export const SPECIES = ["dog", "cat"] as const;
export type Species = (typeof SPECIES)[number];

/** A single lab panel. Each physical kit tests exactly one panel. */
export const PANELS = ["fecal", "respiratory", "oral"] as const;
export type Panel = (typeof PANELS)[number];

/** What a customer can buy. `complete` is a bundle of every panel. */
export const TEST_TYPES = [...PANELS, "complete"] as const;
export type TestType = (typeof TEST_TYPES)[number];

/** Panels (and therefore kits) shipped for a purchased test type. */
export function panelsForTestType(testType: TestType): Panel[] {
  return testType === "complete" ? [...PANELS] : [testType];
}

export const SPECIES_LABEL: Record<Species, { adjective: string; noun: string }> = {
  dog: { adjective: "Canine", noun: "Dog" },
  cat: { adjective: "Feline", noun: "Cat" },
};

export const PANEL_LABEL: Record<Panel, string> = {
  fecal: "Fecal",
  respiratory: "Respiratory",
  oral: "Oral",
};

/** e.g. "Feline Fecal Kit" */
export function kitDisplayName(species: Species, panel: Panel): string {
  return `${SPECIES_LABEL[species].adjective} ${PANEL_LABEL[panel]} Kit`;
}
