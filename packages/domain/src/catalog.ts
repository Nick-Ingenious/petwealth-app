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

const SPECIES_WORDS: Record<Species, RegExp> = {
  dog: /\b(dog|dogs|canine|puppy|puppies)\b/i,
  cat: /\b(cat|cats|feline|kitten|kittens)\b/i,
};
const TEST_TYPE_WORDS: Record<TestType, RegExp> = {
  complete: /\b(complete|full|total|bundle|all[- ]in[- ]one)\b/i,
  fecal: /\b(fecal|faecal|stool|gut|microbiome|poop)\b/i,
  respiratory: /\b(respiratory|breathing|airway|nasal)\b/i,
  oral: /\b(oral|dental|mouth|teeth)\b/i,
};

/**
 * Best-effort mapping of a store product title (e.g. "Dog Respiratory Health
 * Kit", "Feline Complete Health Kit") to what we ship. Returns null when the
 * title is ambiguous — callers must then flag the order for staff instead of
 * guessing. "complete" wins when combined with a panel word ("Complete Gut…").
 */
export function parseKitProductTitle(title: string): { species: Species; testType: TestType } | null {
  const species = (Object.keys(SPECIES_WORDS) as Species[]).filter((sp) => SPECIES_WORDS[sp].test(title));
  if (species.length !== 1) return null;
  if (TEST_TYPE_WORDS.complete.test(title)) return { species: species[0]!, testType: "complete" };
  const panels = PANELS.filter((p) => TEST_TYPE_WORDS[p].test(title));
  if (panels.length !== 1) return null;
  return { species: species[0]!, testType: panels[0]! };
}
