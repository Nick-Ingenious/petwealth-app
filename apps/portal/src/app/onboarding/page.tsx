import { getProfile } from "@petwealth/api";
import { Header, Screen } from "@/components/brand";
import { requireCustomer, safeNext } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your account" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const ctx = await requireCustomer({ allowOnboarding: true });
  const next = safeNext((await searchParams).next);
  const profile = await getProfile(ctx);
  return (
    <Screen>
      <Header showCode={false} />
      <p className="mt-6 text-lg text-zinc-500">Step 1 of 2</p>
      <h1 className="mt-3 text-5xl font-light leading-tight tracking-tight">
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
    </Screen>
  );
}
