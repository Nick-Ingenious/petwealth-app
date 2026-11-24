import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { HeroDog, Screen, Wordmark } from "@/components/brand";
import { DEV_BYPASS_CUSTOMER_EMAIL } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  if (DEV_BYPASS_CUSTOMER_EMAIL) redirect("/");
  return (
    <Screen>
      <div className="flex flex-col items-center gap-8 pt-10">
        <Wordmark />
        <HeroDog />
        <SignIn signUpUrl="/sign-up" />
      </div>
    </Screen>
  );
}
