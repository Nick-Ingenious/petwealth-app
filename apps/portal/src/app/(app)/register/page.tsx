import { listMyPets } from "@petwealth/api";
import { Header, Screen } from "@/components/brand";
import { requireCustomer } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Activate your kits" };

/**
 * Kit activation. The tube's QR code can deep-link here as /register?kit=FRES-001-937;
 * ?kits=A,B is used to keep scanned codes when returning from Add Pet.
 */
export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(","));
  const initialCodes = [...new Set([...list(sp.kits), ...list(sp.kit), ...list(sp.code)])].filter(Boolean).slice(0, 10);
  const ctx = await requireCustomer({ next: `/register${initialCodes.length ? `?kits=${encodeURIComponent(initialCodes.join(","))}` : ""}` });
  const newPetId = list(sp.pet).at(-1) ?? null;
  const pets = await listMyPets(ctx);
  return (
    <Screen>
      <Header showCode={false} />
      <p className="mt-6 text-lg text-zinc-500">Step 2 of 2</p>
      <h1 className="mt-3 text-5xl font-light leading-tight tracking-tight">
        Activate your <strong className="font-bold">Health Test Kits</strong>
      </h1>
      <p className="mb-8 mt-4 text-xl text-zinc-500">
        Each tube you scan shows up here. Tell us which pet each kit is for; no tracking number needed, your shipping label is made for you.
      </p>
      <RegisterForm
        pets={pets.map((p) => ({ id: p.id, name: p.name, species: p.species, breed: p.breed, sex: p.sex, weightLbs: p.weightLbs }))}
        initialCodes={initialCodes}
        newPetId={newPetId}
      />
    </Screen>
  );
}
