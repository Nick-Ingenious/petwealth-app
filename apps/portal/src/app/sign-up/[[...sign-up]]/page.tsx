import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { HeroDog, Screen, Wordmark } from "@/components/brand";
import { DEV_BYPASS_CUSTOMER_EMAIL } from "@/lib/env";

export const metadata = { title: "Create your account" };

export default function SignUpPage() {
  if (DEV_BYPASS_CUSTOMER_EMAIL) redirect("/");
  return (
    <Screen>
      <div className="flex flex-col items-center gap-8 pt-10">
        <Wordmark />
        <HeroDog />
        <SignUp signInUrl="/sign-in" />
      </div>
    </Screen>
  );
}
