import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { authAppearance } from "@/components/auth-appearance";
import { HeroDog, Screen } from "@/components/brand";
import { DEV_BYPASS_CUSTOMER_EMAIL } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  if (DEV_BYPASS_CUSTOMER_EMAIL) redirect("/");
  return (
    <Screen>
      <div className="flex justify-center pt-4">
        <HeroDog />
      </div>
      <h1 className="mt-6 text-4xl font-light leading-tight tracking-tight">
        <strong className="font-bold">Welcome back!</strong> Sign in.
      </h1>
      <p className="mb-8 mt-3 text-xl text-zinc-500">Check on your kits and your pet&apos;s results.</p>
      <SignIn signUpUrl="/sign-up" appearance={authAppearance} />
    </Screen>
  );
}
