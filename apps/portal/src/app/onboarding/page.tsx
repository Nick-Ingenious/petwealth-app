import Image from "next/image";
import { Check } from "lucide-react";
import { getProfile } from "@petwealth/api";
import { Header, Screen } from "@/components/brand";
import { requireCustomer, safeNext } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your account" };

const ADVANTAGES = [
  "Unlock test results & health insights",
  "Track your pet's health journey",
  "Access to vet consultations",
  "Save thousands in preventative care",
];

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const ctx = await requireCustomer({ allowOnboarding: true });
  const next = safeNext((await searchParams).next);
  const profile = await getProfile(ctx);
  return (
    <Screen>
      <Header showCode={false} />
      <p className="mt-6 text-lg text-zinc-500">Step 1 of 2</p>
      <h1 className="mt-3 text-4xl font-light leading-tight tracking-tight">
        Set up your <strong className="font-bold">account</strong>
      </h1>
      <p className="mb-8 mt-4 text-xl text-zinc-500">Help us personalize your experience</p>
      <OnboardingForm
        next={next}
        needsAddress={profile.addresses.length === 0}
        initial={{
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          phone: profile.phone?.replace(/^\+1/, "") ?? "",
          customerType: profile.customerType ?? "",
          smsOptIn: profile.smsOptIn,
        }}
      />
      <section className="mt-12 px-4">
        <Image src="/onboarding/kit-activation.webp" alt="" width={719} height={558} sizes="(max-width: 448px) 80vw, 360px" className="mx-auto h-auto w-4/5" />
        <h2 className="mt-6 text-xl font-semibold tracking-tight">The Petwealth Advantage:</h2>
        <ul className="mt-4 space-y-3">
          {ADVANTAGES.map((a) => (
            <li key={a} className="flex items-start gap-3 text-lg">
              <Check className="mt-1 size-4 shrink-0 text-violet-400" strokeWidth={3} aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      </section>
    </Screen>
  );
}
