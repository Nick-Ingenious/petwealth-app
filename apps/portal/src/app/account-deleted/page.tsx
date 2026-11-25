import Link from "next/link";
import { Screen } from "@/components/brand";

export const metadata = { title: "Account deleted" };

/** Shown after Delete account. Public: the login no longer exists. */
export default function AccountDeletedPage() {
  return (
    <Screen>
      <div className="flex min-h-dvh flex-col justify-center py-10 text-center">
        <h1 className="text-3xl font-semibold">Your account is deleted</h1>
        <p className="mt-4 text-lg text-zinc-600">
          Your account and the personal information tied to it are gone. We kept your kits&apos; test scores and records without your name or any information about your
          pet.
        </p>
        <Link href={"/sign-in" as never} className="mt-8 flex h-14 items-center justify-center rounded-full bg-lilac-300 text-lg font-semibold text-ink">
          Done
        </Link>
      </div>
    </Screen>
  );
}
