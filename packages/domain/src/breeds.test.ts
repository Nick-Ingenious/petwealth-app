import { describe, expect, it } from "vitest";
import { BREEDS, RENAMED_BREEDS, searchBreeds } from "./breeds";

describe("BREEDS", () => {
  it("has the old app's breeds, Mixed breed first and Other last, no duplicates", () => {
    for (const list of [BREEDS.dog, BREEDS.cat]) {
      expect(list[0]).toBe("Mixed breed");
      expect(list.at(-1)).toBe("Other");
      expect(new Set(list).size).toBe(list.length);
    }
    expect(BREEDS.dog.length).toBeGreaterThan(300);
    expect(BREEDS.dog).toEqual(expect.arrayContaining(["Cavapoo", "Golden Retriever", "Goldendoodle", "American Pit Bull Terrier"]));
    expect(BREEDS.cat).toEqual(expect.arrayContaining(["Domestic Shorthair", "Maine Coon", "Ragdoll"]));
    for (const renamed of Object.values(RENAMED_BREEDS)) expect(BREEDS.dog).toContain(renamed);
  });
});

describe("searchBreeds", () => {
  it("finds a breed by any part of its name, ignoring case and punctuation", () => {
    expect(searchBreeds(BREEDS.dog, "cavapoo")[0]).toBe("Cavapoo");
    expect(searchBreeds(BREEDS.dog, "CAVA POO")).toContain("Cavapoo");
    expect(searchBreeds(BREEDS.dog, "poodle toy")).toContain("Poodle (Toy)");
    expect(searchBreeds(BREEDS.cat, "shorthair")).toContain("Domestic Shorthair");
  });

  it("puts names that start with the search first", () => {
    const r = searchBreeds(BREEDS.dog, "golden");
    expect(r[0]!.toLowerCase().startsWith("golden")).toBe(true);
    expect(r).toContain("Golden Retriever");
  });

  it("returns everything for an empty search and nothing for nonsense", () => {
    expect(searchBreeds(BREEDS.dog, "  ")).toBe(BREEDS.dog);
    expect(searchBreeds(BREEDS.dog, "zzqx")).toEqual([]);
  });
});
