import Link from "next/link";
import { notFound } from "next/navigation";
import { PawPrint } from "lucide-react";
import { AppError, can, getPet } from "@petwealth/api";
import { SPECIES_LABEL } from "@petwealth/domain";
import { Card, CardBody, CardHeader, KitStatusBadge, PageHeader } from "@petwealth/ui";
import { requireStaff } from "@/lib/auth";
import { formatDate, fullName, kitName, petAge, petRef } from "@/lib/format";
import { PetForm } from "./pet-form";

export default async function PetDetail({ params }: PageProps<"/pets/[id]">) {
  const staff = await requireStaff("pets.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const pet = await getPet(staff, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/pets" className="text-ink-muted hover:text-ink">← Pets</Link></p>
      <PageHeader icon={<PawPrint className="size-6" />} title={pet.name} description={`${petRef(pet.number)} · ${SPECIES_LABEL[pet.species].noun} · ${petAge(pet.dateOfBirth)}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <PetForm
                id={pet.id}
                canEdit={can(staff, "pets.manage")}
                speciesLocked={pet.kits.length > 0}
                initial={{ name: pet.name, species: pet.species, breed: pet.breed ?? "", dateOfBirth: pet.dateOfBirth ?? "" }}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Tests" description={`${pet.kits.length} kits`} />
            <CardBody>
              {pet.kits.length === 0 ? <p className="text-sm text-ink-muted">No kits linked to this pet yet.</p> : null}
              <ul className="divide-y divide-line">
                {pet.kits.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      {k.code ? <Link href={`/kits/${k.code}`} className="font-mono text-brand-700 hover:underline">{k.code}</Link> : null}
                      <p className="text-xs text-ink-subtle">{kitName(k)} · updated {formatDate(k.statusChangedAt)}</p>
                    </div>
                    <KitStatusBadge status={k.status} />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Owner" />
          <CardBody>
            <Link href={`/customers/${pet.customer.id}`} className="font-medium text-brand-700 hover:underline">{fullName(pet.customer)}</Link>
            <p className="text-sm text-ink-muted">{pet.customer.email}</p>
            <p className="text-sm text-ink-muted">{pet.customer.phone ?? "No phone"}</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
