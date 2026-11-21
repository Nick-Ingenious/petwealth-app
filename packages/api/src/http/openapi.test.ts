import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";

describe("openapi", () => {
  it("generates a 3.1 document covering every v1 route", () => {
    const doc = getOpenApiDocument();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths ?? {})).toEqual(
      expect.arrayContaining(["/api/v1/orders", "/api/v1/kits/{code}/receive", "/api/v1/customers/{id}", "/api/v1/pets"]),
    );
    expect(doc.components?.schemas?.KitStatus).toBeDefined();
  });
});
