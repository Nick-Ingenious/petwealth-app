import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { authAppearance } from "@/components/auth-appearance";
import { HeroDog, Screen } from "@/components/brand";
import { DEV_BYPASS_CUSTOMER_EMAIL } from "@/lib/env";

export const metadata = { title: "Create your account" };

export default function SignUpPage() {
  if (DEV_BYPASS_CUSTOMER_EMAIL) redirect("/");
  return (
    <Screen>
      <div className="flex justify-center pt-4">
        <HeroDog />
      </div>
      <h1 className="mt-6 text-4xl font-light leading-tight tracking-tight">
        <strong className="font-bold">Welcome!</strong> Register your kit.
      </h1>
      <p className="mb-8 mt-3 text-xl text-zinc-500">Activate your Petwealth kit in under 2 minutes.</p>
      <SignUp signInUrl="/sign-in" appearance={authAppearance} />
    </Screen>
  );
}
