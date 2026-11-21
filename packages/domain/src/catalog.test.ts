import { describe, expect, it } from "vitest";
import { panelsForTestType, parseKitProductTitle } from "./catalog";

describe("parseKitProductTitle", () => {
  it.each([
    ["Dog Respiratory Health Kit", "dog", "respiratory"],
    ["Cat Fecal Health Kit", "cat", "fecal"],
    ["Cat Complete Health Kit", "cat", "complete"],
    ["Canine Oral Kit", "dog", "oral"],
    ["Feline Gut Microbiome Test", "cat", "fecal"],
    ["Puppy Dental Screening", "dog", "oral"],
  ] as const)("maps %s", (title, species, testType) => {
    expect(parseKitProductTitle(title)).toEqual({ species, testType });
  });

  it.each(["Gift Card", "Health Kit", "Dog & Cat Fecal Kit", "Dog Fecal + Oral Kit", "Cat Vitamins"])(
    "refuses to guess for %s",
    (title) => expect(parseKitProductTitle(title)).toBeNull(),
  );

  it("expands complete into every panel", () => {
    expect(panelsForTestType("complete")).toEqual(["fecal", "respiratory", "oral"]);
  });
});
