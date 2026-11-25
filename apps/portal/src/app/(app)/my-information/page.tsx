import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getProfile } from "@petwealth/api";
import { Screen } from "@/components/brand";
import { requireCustomer } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "My Information" };

/** +14155550142 → "(415) 555-0142" for editing; the server stores E.164 again. */
function displayPhone(e164: string | null): string {
  const d = (e164 ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (e164 ?? "");
}

export default async function MyInformationPage() {
  const ctx = await requireCustomer({ next: "/my-information" });
  const profile = await getProfile(ctx);
  const address = profile.addresses[0];
  return (
    <Screen>
      <header className="-mx-5 mb-6 flex items-center gap-4 border-b border-zinc-200 px-5 py-5">
        <Link href="/" aria-label="Back" className="p-1">
          <ChevronLeft className="size-7" />
        </Link>
        <h1 className="text-3xl font-semibold">My Information</h1>
      </header>
      <ProfileForm
        initial={{
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          email: profile.email,
          phone: displayPhone(profile.phone),
          smsOptIn: profile.smsOptIn,
          line1: address?.line1 ?? "",
          line2: address?.line2 ?? "",
          city: address?.city ?? "",
          region: address?.region ?? "",
          postalCode: address?.postalCode ?? "",
        }}
      />
    </Screen>
  );
}
