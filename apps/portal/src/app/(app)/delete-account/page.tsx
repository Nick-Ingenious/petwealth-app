import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Screen } from "@/components/brand";
import { requireCustomer } from "@/lib/auth";
import { DeleteAccountForm } from "./delete-form";

export const metadata = { title: "Delete account" };

export default async function DeleteAccountPage() {
  await requireCustomer({ next: "/delete-account", allowOnboarding: true });
  return (
    <Screen>
      <header className="-mx-5 mb-6 flex items-center gap-4 border-b border-zinc-200 px-5 py-5">
        <Link href="/" aria-label="Back" className="p-1">
          <ChevronLeft className="size-7" />
        </Link>
        <h1 className="text-3xl font-semibold">Delete account</h1>
      </header>
      <h2 className="text-2xl font-semibold">Delete your account</h2>
      <section className="mt-5 rounded-2xl bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[#5F666B]">What we delete</p>
        <p className="mt-1 text-base text-zinc-700">Your account, your pets and their photos, and your reports.</p>
        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#5F666B]">What we keep</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-zinc-700">
          <li>Your kits&apos; test scores and kit records, without your name or any information about your pet.</li>
          <li>Order and payment records are kept and handled by our team.</li>
        </ul>
      </section>
      <p className="my-5 text-base text-zinc-700">This can&apos;t be undone. We&apos;ll confirm here when it&apos;s done.</p>
      <DeleteAccountForm />
    </Screen>
  );
}
