import { describe, expect, it } from "vitest";
import { formatKitCode, normalizeKitCode, parseKitCode } from "./kit-code";

describe("kit codes", () => {
  it("parses a canonical code", () => {
    expect(parseKitCode("FFEC-002-946")).toEqual({
      code: "FFEC-002-946",
      species: "cat",
      panel: "fecal",
      lot: "002",
      serial: "946",
    });
  });

  it("normalises scanner and keyboard variants", () => {
    expect(normalizeKitCode("  cres 002 736 ")).toBe("CRES-002-736");
    expect(normalizeKitCode("FORA–001–846")).toBe("FORA-001-846");
    expect(parseKitCode("cora_002_724")?.panel).toBe("oral");
  });

  it("rejects invalid codes", () => {
    for (const bad of ["", "FEC-123-456", "XFEC-001-001", "FFEC-1-946", "FFEC-002-9461"]) {
      expect(parseKitCode(bad)).toBeNull();
    }
  });

  it("round-trips through formatKitCode", () => {
    const code = formatKitCode("dog", "respiratory", 4, 57);
    expect(code).toBe("CRES-004-057");
    expect(parseKitCode(code)?.species).toBe("dog");
  });
});
