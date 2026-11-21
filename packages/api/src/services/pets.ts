import { petListQuerySchema, petUpdateSchema, type PetUpdate } from "@petwealth/domain";
import { and, count, desc, eq, getDb, ilike, or, schema as s, sql } from "@petwealth/db";
import { recordEvent } from "../audit";
import { actorFields, requirePermission, type StaffContext } from "../context";
import { conflict, notFound } from "../errors";
import { likePattern, offsetOf, toPage } from "../pagination";

export async function listPets(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "pets.view");
  const q = petListQuerySchema.parse(input ?? {});
  const db = getDb();
  const where = and(
    q.species ? eq(s.pets.species, q.species) : undefined,
    q.q
      ? or(
          ilike(s.pets.name, likePattern(q.q)),
          ilike(s.pets.breed, likePattern(q.q)),
          ilike(sql`${s.customers.firstName} || ' ' || ${s.customers.lastName}`, likePattern(q.q)),
          ilike(s.customers.email, likePattern(q.q)),
          sql`${s.pets.number}::text = ${q.q.replace(/^PET-?/i, "")}`,
        )
      : undefined,
  );
  const kitCount = db.$count(s.kits, eq(s.kits.petId, s.pets.id));
  const [items, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: s.pets.id,
        number: s.pets.number,
        name: s.pets.name,
        species: s.pets.species,
        breed: s.pets.breed,
        dateOfBirth: s.pets.dateOfBirth,
        createdAt: s.pets.createdAt,
        kitCount,
        owner: { id: s.customers.id, firstName: s.customers.firstName, lastName: s.customers.lastName, email: s.customers.email },
      })
      .from(s.pets)
      .innerJoin(s.customers, eq(s.pets.customerId, s.customers.id))
      .where(where)
      .orderBy(desc(s.pets.createdAt))
      .limit(q.pageSize)
      .offset(offsetOf(q)),
    db.select({ total: count() }).from(s.pets).innerJoin(s.customers, eq(s.pets.customerId, s.customers.id)).where(where),
  ]);
  return toPage(items, total, q);
}

export async function getPet(ctx: StaffContext, id: string) {
  requirePermission(ctx, "pets.view");
  const pet = await getDb().query.pets.findFirst({
    where: eq(s.pets.id, id),
    with: {
      customer: true,
      kits: { orderBy: desc(s.kits.statusChangedAt), with: { labResults: true } },
    },
  });
  if (!pet) throw notFound("Pet");
  return pet;
}

export async function updatePet(ctx: StaffContext, id: string, input: PetUpdate | unknown) {
  requirePermission(ctx, "pets.manage");
  const data = petUpdateSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const existing = await tx.query.pets.findFirst({ where: eq(s.pets.id, id), with: { kits: true } });
    if (!existing) throw notFound("Pet");
    if (existing.species !== data.species && existing.kits.length) {
      throw conflict("Species can't be changed once kits are linked — the kits are species-specific.");
    }
    const [updated] = await tx.update(s.pets).set(data).where(eq(s.pets.id, id)).returning();
    await recordEvent(tx, { entityType: "pet", entityId: id, type: "pet.updated", ...actorFields(ctx), payload: { via: ctx.via } });
    return updated!;
  });
}
