/**
 * AI breed avatars: a pet with no photo of its own shows a picture of its
 * breed. One picture per species and breed is generated (on first use) and
 * shared by every pet of that breed. A photo the customer chose always wins.
 *
 *   breed picked in the pet form ──► ensureBreedAvatar (generate once, store)
 *   pet saved / custom photo removed ──► syncPetAvatar (point photoUrl at it)
 */
import { BREEDS, SPECIES, type Species } from "@petwealth/domain";
import { and, eq, getDb, schema as s } from "@petwealth/db";
import { generateBreedAvatar, type BreedAvatarGenerator } from "@petwealth/integrations/ai";
import { z } from "zod";
import { notFound } from "../errors";

export type BreedAvatarOptions = { generate?: BreedAvatarGenerator };

/** Only breeds from the picker get a picture; free text ("Other") never reaches the image model. */
export function canHaveBreedAvatar(species: Species, breed: string | null | undefined): breed is string {
  return Boolean(breed) && breed !== "Other" && BREEDS[species].includes(breed!);
}

/** Photos the customer uploaded live at /api/pets/<id>/photo; anything else is ours to replace. */
export function isCustomPhotoUrl(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith("/api/pets/"));
}

const urlFor = (row: { id: string; updatedAt: Date }) => `/api/breed-avatars/${row.id}?v=${row.updatedAt.getTime().toString(36)}`;

async function findBreedAvatar(species: Species, breed: string) {
  const [row] = await getDb()
    .select({ id: s.breedAvatars.id, updatedAt: s.breedAvatars.updatedAt })
    .from(s.breedAvatars)
    .where(and(eq(s.breedAvatars.species, species), eq(s.breedAvatars.breed, breed)));
  return row;
}

/**
 * The picture's URL for this breed, generating it the first time (about 10 to
 * 20 seconds). Null for breeds outside the picker list. Throws BreedAvatarError
 * if the image model fails.
 */
export async function ensureBreedAvatar(species: Species, breed: string | null | undefined, opts: BreedAvatarOptions = {}): Promise<string | null> {
  if (!canHaveBreedAvatar(species, breed)) return null;
  const existing = await findBreedAvatar(species, breed);
  if (existing) return urlFor(existing);
  const image = await (opts.generate ?? generateBreedAvatar)({ species, breed });
  // Two people picking the same new breed at once: the first stored picture wins.
  await getDb()
    .insert(s.breedAvatars)
    .values({ species, breed, mimeType: image.mimeType, contentBase64: image.base64, model: image.model })
    .onConflictDoNothing();
  const stored = await findBreedAvatar(species, breed);
  return stored ? urlFor(stored) : null;
}

/** Point a pet without a custom photo at its breed's picture (or at nothing). Never generates. */
export async function syncPetAvatar(petId: string): Promise<string | null> {
  const db = getDb();
  const pet = await db.query.pets.findFirst({ where: eq(s.pets.id, petId) });
  if (!pet) return null;
  if (isCustomPhotoUrl(pet.photoUrl)) return pet.photoUrl;
  const avatar = canHaveBreedAvatar(pet.species, pet.breed) ? await findBreedAvatar(pet.species, pet.breed) : undefined;
  const photoUrl = avatar ? urlFor(avatar) : null;
  if (photoUrl !== pet.photoUrl) await db.update(s.pets).set({ photoUrl }).where(eq(s.pets.id, pet.id));
  return photoUrl;
}

/** Generate the pet's breed picture if it's missing, then apply it. Logs instead of throwing (runs after a response). */
export async function ensurePetBreedAvatar(petId: string, opts: BreedAvatarOptions = {}): Promise<void> {
  const pet = await getDb().query.pets.findFirst({ where: eq(s.pets.id, petId) });
  if (!pet || isCustomPhotoUrl(pet.photoUrl) || !canHaveBreedAvatar(pet.species, pet.breed)) return;
  try {
    await ensureBreedAvatar(pet.species, pet.breed, opts);
    await syncPetAvatar(pet.id);
  } catch (e) {
    console.warn(`[breed-avatar] ${pet.species}/${pet.breed}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export const breedAvatarRequestSchema = z.object({ species: z.enum(SPECIES), breed: z.string().trim().max(120) });

/** Picture bytes. Breed pictures aren't personal; the route still requires a signed-in customer. */
export async function getBreedAvatarImage(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Picture");
  const [row] = await getDb().select().from(s.breedAvatars).where(eq(s.breedAvatars.id, id));
  if (!row) throw notFound("Picture");
  return { mimeType: row.mimeType, content: Buffer.from(row.contentBase64, "base64") };
}
