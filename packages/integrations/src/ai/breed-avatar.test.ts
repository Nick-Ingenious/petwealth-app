import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { BREED_AVATAR_SIZE, breedAvatarPrompt, toAvatarJpeg } from "./breed-avatar";

describe("breedAvatarPrompt", () => {
  it("names the breed and species once, on the brand's warm background", () => {
    const p = breedAvatarPrompt("dog", "Golden Retriever");
    expect(p).toContain("a Golden Retriever dog,");
    expect(p).toContain("#F8F2EA");
    expect(p).toContain("No text");
    expect(breedAvatarPrompt("cat", "Domestic Shorthair")).toContain("a Domestic Shorthair cat,");
    expect(breedAvatarPrompt("dog", "Siberian Husky dog")).toContain("a Siberian Husky dog,");
  });

  it("describes mixed breeds without inventing one", () => {
    expect(breedAvatarPrompt("dog", "Mixed breed")).toContain("a friendly mixed-breed dog,");
  });
});

describe("toAvatarJpeg", () => {
  it("shrinks a large model PNG to a small square JPEG", async () => {
    const png = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#d9a066" } }).png().toBuffer();
    const jpeg = await toAvatarJpeg(png);
    const meta = await sharp(jpeg).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: BREED_AVATAR_SIZE, height: BREED_AVATAR_SIZE });
    expect(jpeg.length).toBeLessThan(60_000);
  });
});
