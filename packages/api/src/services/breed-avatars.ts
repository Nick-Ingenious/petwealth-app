/**
 * AI breed avatars: a pet with no photo of its own shows a picture of its
 * breed. One picture per species and breed is generated (on first use) and
 * shared by every pet of that breed. A photo the customer chose always wins.
 *
 *   breed picked in the pet form ──► ensureBreedAvatar (generate once, store)
 *   pet saved / custom photo removed ──► syncPetAvatar (point photoUrl at it)
 */
import { BREEDS, SPECIES, type Species } from "@petwealth/domain";
import { and, asc, eq, getDb, ilike, schema as s, sql } from "@petwealth/db";
import { generateBreedAvatar, type BreedAvatarGenerator } from "@petwealth/integrations/ai";
import { z } from "zod";
import { recordEvent } from "../audit";
import { actorFields, requirePermission, type StaffContext } from "../context";
import { notFound } from "../errors";
import { likePattern } from "../pagination";

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

// ── Staff: review and redraw ─────────────────────────────────────────────

const petsUsing = (id: string) => sql`${s.pets.photoUrl} like ${`/api/breed-avatars/${id}?%`}`;

export const breedAvatarListSchema = z.object({
  species: z.enum(SPECIES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

/** Every breed picture drawn so far, with how many pets show it. */
export async function listBreedAvatars(ctx: StaffContext, input: unknown = {}) {
  requirePermission(ctx, "pets.view");
  const { species, q } = breedAvatarListSchema.parse(input);
  const rows = await getDb()
    .select({
      id: s.breedAvatars.id,
      species: s.breedAvatars.species,
      breed: s.breedAvatars.breed,
      model: s.breedAvatars.model,
      createdAt: s.breedAvatars.createdAt,
      updatedAt: s.breedAvatars.updatedAt,
      // Table-qualified on purpose: inside the subquery a bare "id" would be the pet's.
      petCount: sql<number>`(select count(*) from ${s.pets} p where p.photo_url like '/api/breed-avatars/' || ${s.breedAvatars}.id::text || '?%')`.mapWith(Number),
    })
    .from(s.breedAvatars)
    .where(and(species ? eq(s.breedAvatars.species, species) : undefined, q ? ilike(s.breedAvatars.breed, likePattern(q)) : undefined))
    .orderBy(asc(s.breedAvatars.species), asc(s.breedAvatars.breed));
  return rows.map((r) => ({ ...r, url: urlFor(r), redrawn: r.updatedAt.getTime() - r.createdAt.getTime() > 1000 }));
}

/**
 * Draw a breed's picture again (about 10 to 20 seconds, about $0.04) and
 * switch every pet showing it to the new one. Pets with their own photo are
 * untouched.
 */
export async function redrawBreedAvatar(ctx: StaffContext, id: string, opts: BreedAvatarOptions = {}) {
  requirePermission(ctx, "pets.manage");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Picture");
  const db = getDb();
  const [row] = await db.select().from(s.breedAvatars).where(eq(s.breedAvatars.id, id));
  if (!row) throw notFound("Picture");
  const image = await (opts.generate ?? generateBreedAvatar)({ species: row.species, breed: row.breed });
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(s.breedAvatars)
      .set({ mimeType: image.mimeType, contentBase64: image.base64, model: image.model, updatedAt: new Date() })
      .where(eq(s.breedAvatars.id, id))
      .returning({ id: s.breedAvatars.id, updatedAt: s.breedAvatars.updatedAt });
    const url = urlFor(updated!);
    // New version in the URL, so phones that cached the old picture fetch the new one.
    const pets = await tx.update(s.pets).set({ photoUrl: url }).where(petsUsing(id)).returning({ id: s.pets.id });
    await recordEvent(tx, {
      entityType: "breed_avatar",
      entityId: id,
      type: "breed_avatar.redrawn",
      ...actorFields(ctx),
      payload: { species: row.species, breed: row.breed, model: image.model, pets: pets.length },
    });
    return { url, pets: pets.length };
  });
}

/** Picture bytes for staff (any picture, by id). */
export async function getBreedAvatarImageForStaff(ctx: StaffContext, id: string) {
  requirePermission(ctx, "pets.view");
  return getBreedAvatarImage(id);
}
