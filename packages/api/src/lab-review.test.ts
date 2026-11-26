import { describe, expect, it } from "vitest";
import { closestKits, kitCodeKey } from "./services/lab-review";

describe("matching misformatted sample IDs to waiting kits", () => {
  const kits = ["FFEC-004-926", "FFEC-004-927", "CFEC-004-926", "FRES-118-302"].map((code) => ({ code }));

  it("folds dashes, spaces, case and look-alike characters", () => {
    expect(kitCodeKey(" ffec 0O4-926 ")).toBe("FFEC004926");
    expect(kitCodeKey("FRES-1I8-3O2")).toBe("FRES118302");
  });

  it("puts the exact match first and keeps near ones for the AI to weigh", () => {
    expect(closestKits("FFEC004926", kits).map((k) => k.code)).toEqual(["FFEC-004-926", "CFEC-004-926", "FFEC-004-927"]);
    expect(closestKits("FFFEC-004-926", kits)[0]!.code).toBe("FFEC-004-926");
    expect(closestKits("fres-118-3o2", kits).map((k) => k.code)).toEqual(["FRES-118-302"]);
  });

  it("offers nothing for samples nowhere near a kit", () => {
    expect(closestKits("Sample 12", kits)).toEqual([]);
  });
});
