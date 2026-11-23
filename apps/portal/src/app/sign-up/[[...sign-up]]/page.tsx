import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import { Screen, Wordmark } from "@/components/brand";
import { DEV_BYPASS_CUSTOMER_EMAIL } from "@/lib/env";

export const metadata = { title: "Create your account" };

export default function SignUpPage() {
  if (DEV_BYPASS_CUSTOMER_EMAIL) redirect("/");
  return (
    <Screen>
      <div className="flex flex-col items-center gap-8 pt-10">
        <Wordmark />
        <Image src="/brand/hero-dog.webp" alt="" width={915} height={664} priority sizes="(max-width: 448px) 90vw, 400px" className="-my-2 h-auto w-full max-w-sm" />
        <SignUp signInUrl="/sign-in" />
      </div>
    </Screen>
  );
}
