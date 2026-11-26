/**
 * AI picture of a breed, used as the avatar for pets without a photo of their
 * own. Drawn through Vercel AI Gateway (Vercel OIDC on deployments, or
 * AI_GATEWAY_API_KEY locally). One picture per species and breed is stored and
 * shared, so this runs once per breed, not once per pet.
 */
import { generateImage } from "ai";
import sharp from "sharp";
import type { Species } from "@petwealth/domain";

/** Stored size: plenty for a 90px avatar on a 3x screen, and about 30 to 60 KB. */
export const BREED_AVATAR_SIZE = 384;

/** Photo-realistic image model; override with BREED_AVATAR_MODEL. */
export const BREED_AVATAR_MODEL = "bfl/flux-3-image";

export type BreedAvatarImage = { mimeType: string; base64: string; model: string };
export type BreedAvatarGenerator = (input: { species: Species; breed: string }) => Promise<BreedAvatarImage>;

export class BreedAvatarError extends Error {
  override name = "BreedAvatarError";
}

/** Warm, natural portrait on the brand's stone background: candid and real, never glossy or cartoonish. */
export function breedAvatarPrompt(species: Species, breed: string): string {
  const subject = /mixed/i.test(breed)
    ? `a friendly mixed-breed ${species}`
    : `a ${breed}${breed.toLowerCase().includes(species) ? "" : ` ${species}`}`;
  return [
    `A natural, candid portrait photograph of ${subject}, head and shoulders, centered, looking toward the camera.`,
    "Soft natural window light, warm and calm. Plain warm cream background (#F8F2EA), shallow depth of field.",
    "Realistic fur detail and a gentle expression. Square crop with a little space around the head so it works in a round avatar.",
    "No text, no logos, no collar tags, no people, no props, no other animals.",
  ].join(" ");
}

/** Models return large PNGs (about 1.5 MB); store a small square JPEG instead. */
export function toAvatarJpeg(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes).resize(BREED_AVATAR_SIZE, BREED_AVATAR_SIZE, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

export const generateBreedAvatar: BreedAvatarGenerator = async ({ species, breed }) => {
  const model = process.env.BREED_AVATAR_MODEL || BREED_AVATAR_MODEL;
  try {
    const { images } = await generateImage({
      model,
      prompt: breedAvatarPrompt(species, breed),
      aspectRatio: "1:1",
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(90_000),
    });
    const image = images[0];
    if (!image) throw new BreedAvatarError("The image model returned no picture.");
    return { mimeType: "image/jpeg", base64: (await toAvatarJpeg(image.uint8Array)).toString("base64"), model };
  } catch (e) {
    if (e instanceof BreedAvatarError) throw e;
    throw new BreedAvatarError(`Breed picture failed: ${e instanceof Error ? e.message : String(e)}`);
  }
};
