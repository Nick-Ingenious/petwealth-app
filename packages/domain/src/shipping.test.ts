import { describe, expect, it } from "vitest";
import { MAX_KITS_PER_MAILER, formatRma, kitRegistrationSchema } from "./shipping";

const pet = "0b7a3c1e-2f4d-4a6b-9c8d-1e2f3a4b5c6d";

describe("shipping rules", () => {
  it("formats RMA numbers like the existing app", () => {
    expect(formatRma(172)).toBe("PWR0000172");
    expect(formatRma(100000)).toBe("PWR0100000");
  });

  it("normalises kit codes and requires a pet", () => {
    const ok = kitRegistrationSchema.parse({ kits: [{ kitCode: "fres 001 937", petId: pet }] });
    expect(ok.kits[0]!.kitCode).toBe("FRES-001-937");
    expect(kitRegistrationSchema.safeParse({ kits: [{ kitCode: "FRES-001-937", petId: "" }] }).success).toBe(false);
  });

  it("enforces mailer capacity and rejects duplicates", () => {
    const many = Array.from({ length: MAX_KITS_PER_MAILER + 1 }, (_, i) => ({ kitCode: `FFEC-001-${String(100 + i)}`, petId: pet }));
    expect(kitRegistrationSchema.safeParse({ kits: many }).success).toBe(false);
    expect(kitRegistrationSchema.safeParse({ kits: [] }).success).toBe(false);
    const dup = [{ kitCode: "FFEC-001-100", petId: pet }, { kitCode: "ffec-001-100", petId: pet }];
    expect(kitRegistrationSchema.safeParse({ kits: dup }).success).toBe(false);
  });
});
